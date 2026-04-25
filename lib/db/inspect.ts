// Read-only inspection of a candidate backup file. Used by the import
// preview sheet so users can confirm "yes this is the right file" before
// the destructive overwrite, and so we can hard-reject files that pass
// the SQLite magic check but aren't valid Kharcha backups (other apps'
// SQLite databases, half-finished migrations, truncated downloads).
//
// Inspection runs against an in-memory copy of the bytes via
// `deserializeDatabaseAsync`, so the live DB is never touched and the
// picked file on disk is left alone until the user confirms.
import * as SQLite from "expo-sqlite";
import { CONFIG_KEYS } from "@/lib/constants";
import { isSqliteBytes } from "./files";

export const APP_ID_VALUE = "kharcha";

// Tables we expect to find in any Kharcha backup. `holdings` and `tags`
// shipped later than the others — present in any current backup, but
// older backups predating those features are still valid imports (we
// recreate the missing tables in initDB after import). So they're
// inspected for stats but not required for validation.
const REQUIRED_TABLES = [
  "transactions",
  "categories",
  "sources",
  "subscriptions",
  "config",
];

export type BackupStats = {
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  investmentCount: number;
  incomeTotal: number;
  expenseTotal: number;
  subscriptionCount: number;
  subscriptionMonthly: number;
  holdingCount: number;
  holdingInvested: number;
  budgetCount: number;
  categoryCount: number;
  sourceCount: number;
  tagCount: number;
  oldestDate: string | null;
  newestDate: string | null;
};

export type InspectOk = { ok: true; stats: BackupStats };
export type InspectFail = { ok: false; reason: string };
export type InspectResult = InspectOk | InspectFail;

export async function inspectBackupBytes(
  bytes: Uint8Array,
): Promise<InspectResult> {
  if (!isSqliteBytes(bytes)) {
    return { ok: false, reason: "Selected file is not a SQLite database." };
  }

  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.deserializeDatabaseAsync(bytes);
  } catch {
    return {
      ok: false,
      reason: "Could not open the file as a database — it may be corrupted.",
    };
  }

  try {
    const tables = db
      .getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'",
      )
      .map((r) => r.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Backup is missing required tables: ${missing.join(", ")}.`,
      };
    }

    // App marker: present on any DB created by a recent Kharcha install.
    // Absent on older backups (pre-marker) — those are still valid as long
    // as the schema looks right, which we already checked above.
    const appRow = db.getFirstSync<{ value: string }>(
      "SELECT value FROM config WHERE key = ?",
      CONFIG_KEYS.APP_ID,
    );
    if (appRow && appRow.value !== APP_ID_VALUE) {
      return {
        ok: false,
        reason: `Backup belongs to a different app (${appRow.value}).`,
      };
    }

    const stats = collectStats(db, tables);
    return { ok: true, stats };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Inspection failed.",
    };
  } finally {
    try {
      db.closeSync();
    } catch {
      // best-effort
    }
  }
}

function collectStats(
  db: SQLite.SQLiteDatabase,
  tables: string[],
): BackupStats {
  const txnByType = db.getAllSync<{ type: string; n: number; total: number }>(
    "SELECT type, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM transactions GROUP BY type",
  );
  const counts = { income: 0, expense: 0, transfer: 0, investment: 0 };
  const totals = { income: 0, expense: 0 };
  for (const row of txnByType) {
    if (row.type === "income") {
      counts.income = row.n;
      totals.income = row.total;
    } else if (row.type === "expense") {
      counts.expense = row.n;
      totals.expense = row.total;
    } else if (row.type === "transfer") {
      counts.transfer = row.n;
    } else if (row.type === "investment") {
      counts.investment = row.n;
    }
  }
  const transactionCount =
    counts.income + counts.expense + counts.transfer + counts.investment;

  const dateRange = db.getFirstSync<{
    oldest: string | null;
    newest: string | null;
  }>("SELECT MIN(date) AS oldest, MAX(date) AS newest FROM transactions");

  const subRow = db.getFirstSync<{ n: number; total: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM subscriptions WHERE is_active = 1",
  );

  const holdingRow = tables.includes("holdings")
    ? db.getFirstSync<{ n: number; invested: number }>(
        "SELECT COUNT(*) AS n, COALESCE(SUM(invested), 0) AS invested FROM holdings WHERE COALESCE(is_closed, 0) = 0",
      )
    : null;

  const budgetRow = db.getFirstSync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM budgets",
  );
  const categoryRow = db.getFirstSync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM categories",
  );
  const sourceRow = db.getFirstSync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sources",
  );
  const tagRow = tables.includes("tags")
    ? db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM tags")
    : null;

  return {
    transactionCount,
    incomeCount: counts.income,
    expenseCount: counts.expense,
    transferCount: counts.transfer,
    investmentCount: counts.investment,
    incomeTotal: totals.income,
    expenseTotal: totals.expense,
    subscriptionCount: subRow?.n ?? 0,
    subscriptionMonthly: subRow?.total ?? 0,
    holdingCount: holdingRow?.n ?? 0,
    holdingInvested: holdingRow?.invested ?? 0,
    budgetCount: budgetRow?.n ?? 0,
    categoryCount: categoryRow?.n ?? 0,
    sourceCount: sourceRow?.n ?? 0,
    tagCount: tagRow?.n ?? 0,
    oldestDate: dateRange?.oldest ?? null,
    newestDate: dateRange?.newest ?? null,
  };
}

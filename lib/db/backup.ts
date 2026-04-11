import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import * as Updates from "expo-updates";
import { DB_NAME } from "@/lib/constants";
import { db } from "./connection";
import { categories, sources, transactions } from "./schema";

// SQLite file format magic — first 16 bytes of every valid db.
// https://www.sqlite.org/fileformat.html#magic_header_string
const SQLITE_MAGIC = "SQLite format 3";
const TEMP_DB_NAME = "import_temp.db";

const dbFile = new File(Paths.document, "SQLite", DB_NAME);

export async function exportDatabase(): Promise<void> {
  if (!dbFile.exists) {
    throw new Error("Database file not found");
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(dbFile.uri, {
    mimeType: "application/octet-stream",
    dialogTitle: "Export kharcha data",
  });
}

export async function pickDatabaseFile(): Promise<string | null> {
  const picked = await File.pickFileAsync();
  if (!picked) return null;
  const file = Array.isArray(picked) ? picked[0] : picked;
  return file.uri;
}

// Reject files that don't start with the SQLite magic header so we never
// overwrite the live db with a PDF/image/garbage the user accidentally picked.
async function assertValidSqliteFile(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 16) {
    throw new Error("Selected file is too small to be a SQLite database");
  }
  const view = new Uint8Array(buffer, 0, 16);
  const header = Array.from(view, (b) => String.fromCharCode(b)).join("");
  if (!header.startsWith(SQLITE_MAGIC)) {
    throw new Error("Selected file is not a valid SQLite database");
  }
}

export async function importDatabaseReplace(fileUri: string): Promise<void> {
  const source = new File(fileUri);
  await assertValidSqliteFile(source);
  source.copy(dbFile);
  // Reload so drizzle/expo-sqlite pick up the new file. Without this the
  // live connection keeps reading from the old in-memory handle and the app
  // is left in an inconsistent state until the user manually relaunches.
  await Updates.reloadAsync();
}

export async function importDatabaseMerge(fileUri: string): Promise<number> {
  const source = new File(fileUri);
  await assertValidSqliteFile(source);

  // Copy into the default SQLite directory (same place expo-sqlite opens
  // from). The previous impl copied to cache/ but opened from docs/SQLite/,
  // which silently created an empty database and merged 0 rows every time.
  const tempFile = new File(Paths.document, "SQLite", TEMP_DB_NAME);
  if (tempFile.exists) tempFile.delete();
  source.copy(tempFile);

  const tempExpo = SQLite.openDatabaseSync(TEMP_DB_NAME);
  const tempDb = drizzle(tempExpo, { logger: false });

  try {
    // Build name→id maps from the current db so we can remap FK ids across
    // databases. Autoincrement ids from the imported db have no relationship
    // to ids here — without remapping, a "food" tx could silently become
    // "utilities" after merge.
    const currentCats = await db
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
      })
      .from(categories);
    const currentSrcs = await db
      .select({ id: sources.id, name: sources.name })
      .from(sources);
    const catKey = (name: string, type: string) =>
      `${type}:${name.toLowerCase()}`;
    const catNameToId = new Map(
      currentCats.map((c) => [catKey(c.name, c.type), c.id]),
    );
    const srcNameToId = new Map(
      currentSrcs.map((s) => [s.name.toLowerCase(), s.id]),
    );

    // Join the imported transactions against the imported categories/sources
    // so we get names (stable across dbs) instead of ids (not stable).
    const importedRows = await tempDb
      .select({
        type: transactions.type,
        amount: transactions.amount,
        merchant: transactions.merchant,
        date: transactions.date,
        note: transactions.note,
        category_name: categories.name,
        source_name: sources.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .leftJoin(sources, eq(transactions.source_id, sources.id));

    let merged = 0;
    await db.transaction(async (tx) => {
      for (const row of importedRows) {
        // Null-merchant rows should only match other null-merchant rows.
        // Previously the check was skipped entirely when merchant was null,
        // which caused any date+amount collision to be treated as a dup.
        const merchantMatch = row.merchant
          ? eq(transactions.merchant, row.merchant)
          : isNull(transactions.merchant);

        const existing = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.date, row.date),
              eq(transactions.amount, row.amount),
              merchantMatch,
            ),
          )
          .limit(1);

        if (existing.length > 0) continue;

        const remappedCatId = row.category_name
          ? (catNameToId.get(catKey(row.category_name, row.type)) ?? null)
          : null;
        const remappedSrcId = row.source_name
          ? (srcNameToId.get(row.source_name.toLowerCase()) ?? null)
          : null;

        await tx.insert(transactions).values({
          type: row.type,
          amount: row.amount,
          merchant: row.merchant,
          category_id: remappedCatId,
          source_id: remappedSrcId,
          source_type: "manual",
          date: row.date,
          note: row.note,
        });
        merged++;
      }
    });

    return merged;
  } finally {
    tempExpo.closeSync();
    if (tempFile.exists) tempFile.delete();
  }
}

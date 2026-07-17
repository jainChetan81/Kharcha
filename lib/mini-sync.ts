import { eq } from "drizzle-orm";
import {
  CONFIG_KEYS,
  PARSED_BY,
  type ParsedByType,
  SOURCE_TYPE,
} from "@/lib/constants";
import { db, findDuplicateTransaction, insertTransaction } from "@/lib/db";
import { getAllCategories } from "@/lib/db/categories";
import { getConfig, updateConfig } from "@/lib/db/config";
import { transactions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ERROR_TYPE, logFirebaseError, withTrace } from "@/lib/firebase";

const MINI_SYNC_LIMIT = 200;
const MINI_SYNC_TIMEOUT_MS = 15_000;

export interface MiniSyncResult {
  added: number;
  skipped: number;
  failed: number;
  notConfigured?: boolean;
  logs: MiniSyncLog[];
}

export interface MiniSyncLog {
  miniId: number;
  merchant: string;
  status: "added" | "skipped" | "failed";
  reason?: string;
}

export interface MiniPushPayload {
  type: "income" | "expense";
  amount: number;
  merchant: string;
  category?: string;
  date: string;
  rawText?: string;
  senderId?: string;
  bankName?: string;
  referenceNumber?: string | null;
  accountLast4?: string | null;
}

interface MiniTransaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  merchant: string;
  category: string | null;
  date: string;
  parsedBy: "regex" | "openrouter" | "failed" | "manual";
  referenceNumber: string | null;
  accountLast4: string | null;
  bankName: string | null;
}

function emptyResult(): MiniSyncResult {
  return { added: 0, skipped: 0, failed: 0, logs: [] };
}

function isConfigured(): boolean {
  return Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
}

function mapParsedBy(value: MiniTransaction["parsedBy"]): ParsedByType | null {
  if (value === PARSED_BY.REGEX) return PARSED_BY.REGEX;
  if (value === PARSED_BY.OPENROUTER) return PARSED_BY.OPENROUTER;
  return null;
}

async function fetchMiniTransactions(
  since: number | null,
): Promise<{ transactions: MiniTransaction[] }> {
  const url = new URL("/transactions", env.MINI_API_URL);
  if (since !== null) {
    url.searchParams.set("since", String(since));
  }
  url.searchParams.set("limit", String(MINI_SYNC_LIMIT));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MINI_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${env.MINI_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Mini sync failed: ${response.status} ${response.statusText} ${bodyText}`.slice(
          0,
          200,
        ),
      );
    }

    return (await response.json()) as { transactions: MiniTransaction[] };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function syncMiniTransactions(): Promise<MiniSyncResult> {
  return withTrace("mini_sync", async () => {
    if (!isConfigured()) {
      return { ...emptyResult(), notConfigured: true };
    }

    const result = emptyResult();

    const cursorRaw = await getConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID);
    const cursor = cursorRaw ? Number(cursorRaw) : null;
    if (cursorRaw && !Number.isFinite(cursor)) {
      throw new Error("Invalid mini sync cursor");
    }

    const data = await fetchMiniTransactions(cursor);
    const rows = data.transactions ?? [];

    if (rows.length === 0) {
      return result;
    }

    const allCategories = await getAllCategories();
    function matchCategoryId(
      name: string | null,
      type: "income" | "expense",
    ): number | null {
      const needle = (name ?? "other").toLowerCase();
      const match = allCategories.find(
        (c) => c.name.toLowerCase() === needle && c.type === type,
      );
      return match?.id ?? null;
    }

    let maxSeenId = cursor ?? 0;

    for (const row of rows) {
      try {
        const parsedBy = mapParsedBy(row.parsedBy);
        if (parsedBy === null) {
          result.skipped++;
          result.logs.push({
            miniId: row.id,
            merchant: row.merchant,
            status: "skipped",
            reason: `unexpected parsedBy: ${row.parsedBy}`,
          });
          maxSeenId = Math.max(maxSeenId, row.id);
          continue;
        }

        const existing = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.mini_transaction_id, row.id))
          .limit(1);

        if (existing.length > 0) {
          result.skipped++;
          result.logs.push({
            miniId: row.id,
            merchant: row.merchant,
            status: "skipped",
            reason: "mini_transaction_id duplicate",
          });
          maxSeenId = Math.max(maxSeenId, row.id);
          continue;
        }

        // Mini dates are YYYY-MM-DD or YYYY-MM-DD HH:mm — keep the time
        // component; truncating it made every synced row display a wrong
        // default time in the app.
        const date = row.date;
        const isDuplicate = await findDuplicateTransaction(
          date,
          row.amount,
          row.merchant,
        );

        if (isDuplicate) {
          result.skipped++;
          result.logs.push({
            miniId: row.id,
            merchant: row.merchant,
            status: "skipped",
            reason: "matched existing transaction by date/amount/merchant",
          });
          maxSeenId = Math.max(maxSeenId, row.id);
          continue;
        }

        const note = row.bankName
          ? `synced from mini${row.accountLast4 ? ` · ${row.accountLast4}` : ""}`
          : "synced from mini";

        await insertTransaction({
          type: row.type,
          amount: row.amount,
          merchant: row.merchant,
          categoryId: matchCategoryId(row.category, row.type),
          sourceId: null,
          sourceType: SOURCE_TYPE.MINI_SYNCED,
          parsedBy,
          miniTransactionId: row.id,
          referenceNumber: row.referenceNumber,
          date,
          note,
        });

        result.added++;
        result.logs.push({
          miniId: row.id,
          merchant: row.merchant,
          status: "added",
        });
      } catch (err) {
        logFirebaseError(err, {
          error_type: ERROR_TYPE.SYNC,
          operation: "mini_sync",
          stage: "process_row",
          mini_id: String(row.id),
        });
        result.failed++;
        result.logs.push({
          miniId: row.id,
          merchant: row.merchant,
          status: "failed",
          reason: String(err).slice(0, 200),
        });
      }

      maxSeenId = Math.max(maxSeenId, row.id);
    }

    if (maxSeenId > 0 && maxSeenId !== cursor) {
      await updateConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID, String(maxSeenId));
    }

    return result;
  });
}

export async function pushTransactionToMini(
  payload: MiniPushPayload,
): Promise<void> {
  if (!isConfigured()) {
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MINI_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.MINI_API_URL}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MINI_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Mini push failed: ${response.status} ${response.statusText} ${bodyText}`.slice(
          0,
          200,
        ),
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

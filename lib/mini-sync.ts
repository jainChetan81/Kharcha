import { eq } from "drizzle-orm";
import { z } from "zod";
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
const MINI_SYNC_MAX_PAGES = 50;
const MINI_SYNC_TIMEOUT_MS = 15_000;

// Mini rows with parsedBy "failed" are parse failures, not real transactions —
// they are skipped, never imported.
const MINI_PARSED_BY_FAILED = "failed";

export interface MiniSyncResult {
  added: number;
  skipped: number;
  failed: number;
  notConfigured?: boolean;
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

const miniTransactionSchema = z.object({
  id: z.number(),
  type: z.enum(["income", "expense"]),
  amount: z.number(),
  merchant: z.string(),
  category: z.string().nullable(),
  date: z.string(),
  parsedBy: z.enum(["regex", "openrouter", "failed", "manual"]),
  referenceNumber: z.string().nullable(),
  accountLast4: z.string().nullable(),
  bankName: z.string().nullable(),
});

type MiniTransaction = z.infer<typeof miniTransactionSchema>;

const miniApiEnvelopeSchema = z.object({
  transactions: z.array(z.unknown()),
});

function emptyResult(): MiniSyncResult {
  return { added: 0, skipped: 0, failed: 0 };
}

export function isConfigured(): boolean {
  return Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
}

// Shared by the settings hook (reads getAllConfig()'s cache, where an unset
// key comes back `undefined`) and the boot-time foreground sync (reads
// getConfig() directly, where an unset key comes back `null`) — one function
// owns both "unset" shapes so the enable rule can't silently diverge between
// the two call sites again.
export function deriveMiniSyncEnabled(
  configured: boolean,
  enabledFlag: string | null | undefined,
): boolean {
  if (enabledFlag === "1") return true;
  if (enabledFlag === undefined || enabledFlag === null) return configured;
  return false;
}

// "manual" rows on the mini are real transactions entered by hand (or pushed
// from the app). The app-side parsed_by enum has no "manual" value — manual
// entries are stored with parsed_by null — so they map to undefined here,
// matching how the app stores its own manual entries.
function mapParsedBy(
  value: MiniTransaction["parsedBy"],
): ParsedByType | undefined {
  if (value === PARSED_BY.REGEX) return PARSED_BY.REGEX;
  if (value === PARSED_BY.OPENROUTER) return PARSED_BY.OPENROUTER;
  return undefined;
}

async function fetchMiniTransactions(since: number | null): Promise<unknown[]> {
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

    const json: unknown = await response.json();
    const envelope = miniApiEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new Error(
        `Mini sync: malformed response envelope: ${envelope.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return envelope.data.transactions;
  } finally {
    clearTimeout(timeoutId);
  }
}

let inFlightSync: Promise<MiniSyncResult> | null = null;

export function syncMiniTransactions(options?: {
  full?: boolean;
}): Promise<MiniSyncResult> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = withTrace("mini_sync", () => runMiniSync(options)).finally(
    () => {
      inFlightSync = null;
    },
  );
  return inFlightSync;
}

async function runMiniSync(options?: {
  full?: boolean;
}): Promise<MiniSyncResult> {
  if (!isConfigured()) {
    return { ...emptyResult(), notConfigured: true };
  }

  const result = emptyResult();

  const cursorRaw = await getConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID);
  const storedCursor = cursorRaw ? Number(cursorRaw) : null;
  if (cursorRaw && !Number.isFinite(storedCursor)) {
    throw new Error("Invalid mini sync cursor");
  }

  // Full sync re-walks the mini from the beginning — the per-row dedupe
  // below (mini_transaction_id first, then date/amount/merchant) makes it
  // idempotent, so previously synced rows are skipped, not duplicated.
  let cursor = options?.full ? null : storedCursor;

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
  // Set on the first row that fails this run and never overwritten after
  // that.
  let firstFailedId: number | null = null;
  // True if any failed row had no usable numeric id at all — unlike
  // firstFailedId, there's no boundary to cap the cursor at, so this
  // forces the persist step below to skip advancing the cursor entirely
  // this run rather than let maxSeenId race past the unidentifiable row
  // via later valid rows in the same page.
  let hadUnidentifiableFailure = false;

  for (let page = 0; page < MINI_SYNC_MAX_PAGES; page++) {
    const rows = await fetchMiniTransactions(cursor);

    if (rows.length === 0) {
      break;
    }

    for (const rawRow of rows) {
      const parsedRow = miniTransactionSchema.safeParse(rawRow);
      if (!parsedRow.success) {
        result.failed++;
        const idGuess =
          typeof rawRow === "object" &&
          rawRow !== null &&
          "id" in rawRow &&
          typeof (rawRow as { id: unknown }).id === "number"
            ? (rawRow as { id: number }).id
            : null;
        logFirebaseError(new Error("Invalid mini transaction row shape"), {
          error_type: ERROR_TYPE.SYNC,
          operation: "mini_sync",
          stage: "validate_row",
          mini_id: idGuess !== null ? String(idGuess) : "unknown",
        });
        if (idGuess !== null) {
          if (firstFailedId === null) firstFailedId = idGuess;
          maxSeenId = Math.max(maxSeenId, idGuess);
        } else {
          hadUnidentifiableFailure = true;
        }
        continue;
      }
      const row = parsedRow.data;

      try {
        if (row.parsedBy === MINI_PARSED_BY_FAILED) {
          result.skipped++;
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
          parsedBy: mapParsedBy(row.parsedBy),
          miniTransactionId: row.id,
          referenceNumber: row.referenceNumber,
          date,
          note,
        });

        result.added++;
      } catch (err) {
        logFirebaseError(err, {
          error_type: ERROR_TYPE.SYNC,
          operation: "mini_sync",
          stage: "process_row",
          mini_id: String(row.id),
        });
        result.failed++;
        if (firstFailedId === null) firstFailedId = row.id;
      }

      maxSeenId = Math.max(maxSeenId, row.id);
    }

    // Persist the cursor after every page so an interrupted sync resumes
    // where it left off instead of refetching processed rows.
    if (hadUnidentifiableFailure) {
      // A row failed with no usable numeric id — there's no boundary to
      // cap the cursor at, so don't advance the persisted cursor at all
      // this run. The whole page (including the unidentifiable row) gets
      // retried next time instead of silently walking past it via later
      // valid rows in the same page. Takes priority over firstFailedId:
      // an id-bearing failure elsewhere in this same page doesn't make it
      // safe to advance past an unidentifiable one.
    } else if (firstFailedId !== null) {
      // A failure this run means the true safe boundary is capped below it
      // — persist that even if it's lower than the previously stored
      // cursor. A full sync (which starts its walk from 0, not from
      // storedCursor) can legitimately need to lower the cursor to expose
      // an earlier unresolved failure for retry; leaving the old, higher
      // cursor in place would silently skip that row forever, defeating
      // the point of capping below the first failure at all. For an
      // incremental sync this is always a no-op-or-forward move: every
      // processed row's id is already > storedCursor by construction of
      // the `since` query, so persistCandidate can never regress it.
      const persistCandidate = Math.min(maxSeenId, firstFailedId - 1);
      await updateConfig(
        CONFIG_KEYS.MINI_SYNC_LAST_ID,
        String(persistCandidate),
      );
    } else if (maxSeenId > (storedCursor ?? 0)) {
      // No failure this run — plain progress tracking. Never move the
      // cursor backwards; a full sync starts below the stored cursor by
      // design and only overtakes it once it's walked back past it.
      await updateConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID, String(maxSeenId));
    }

    // Stop paging further once any row has failed this run. Pages beyond
    // the failure are already excluded from what gets persisted above, so
    // fetching more of them only wastes API/DB work — and for a malformed
    // row with no usable id (which can't set firstFailedId at all),
    // continuing would let maxSeenId race past it via later valid rows,
    // silently losing the one boundary marker (result.failed) that shows
    // it was ever seen.
    if (result.failed > 0) {
      break;
    }

    // A short page means the server has no more rows. Also bail if the
    // cursor didn't advance (misbehaving server) to avoid refetching the
    // same page until the page cap.
    if (rows.length < MINI_SYNC_LIMIT || maxSeenId <= (cursor ?? 0)) {
      break;
    }
    cursor = maxSeenId;
  }

  return result;
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

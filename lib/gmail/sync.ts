import { format } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import {
  CONFIG_KEYS,
  EMAIL_LOG_REASON,
  EMAIL_LOG_STATUS,
  type EmailLogReasonType,
  type EmailLogStatusType,
  GEMINI_ERROR,
  type GeminiErrorType,
  GMAIL_API,
  GMAIL_SYNC_NOTE,
  PARSED_BY,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { getActiveBanksWithEmails } from "@/lib/db/banks";
import { getAllCategories } from "@/lib/db/categories";
import { getConfig, updateConfig } from "@/lib/db/config";
import expo from "@/lib/db/connection";
import { subscriptions, transactions, transactionTags } from "@/lib/db/schema";
import { getActiveTag } from "@/lib/db/tags";
import { ERROR_TYPE, logFirebaseError, withTrace } from "@/lib/firebase";
import { getValidAccessToken } from "./auth";
import { type ParseSource, parseEmailWithFallback } from "./parsers";

// Cap stored note to keep db rows bounded. Gmail snippets are ~200 chars in
// practice; 300 leaves headroom without truncating real snippets.
const MAX_NOTE_CHARS = 300;

export type EmailLogStatus = EmailLogStatusType;

export interface EmailLog {
  id: string;
  from: string;
  subject: string;
  parsedBy: ParseSource;
  status: EmailLogStatus;
  transaction?: {
    amount: number;
    merchant: string | null;
    date: string;
  };
  geminiResponse?: string;
  confidence?: "high" | "medium" | "low";
  reason?: EmailLogReasonType;
  errorMessage?: string;
  body?: string;
}

export interface SyncResult {
  added: number;
  skipped: number;
  failed: number;
  nobanks?: boolean;
  emailLogs: EmailLog[];
}

function emptyResult(nobanks = false): SyncResult {
  return { added: 0, skipped: 0, failed: 0, emailLogs: [], nobanks };
}

function extractHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function senderEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

type DecodeResult = { text: string; failed: boolean };

function base64UrlDecode(data: string): DecodeResult {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { text: new TextDecoder("utf-8").decode(bytes), failed: false };
  } catch {
    return { text: "", failed: true };
  }
}

function findPartData(part: GmailPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findPartData(p, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Gmail's `snippet` previews the first visible text, which for bank emails is
// often a promotional banner (e.g. Visa FIFA ad in HDFC mails) — not the
// transaction body. Pull text/plain when present, fall back to stripped HTML.
// Returns { body, decodeFailed } so the caller can distinguish a malformed
// MIME payload (log as DECODE_ERROR) from a legitimately unparseable body.
function extractBody(payload: GmailPart | undefined): {
  body: string;
  decodeFailed: boolean;
} {
  if (!payload) return { body: "", decodeFailed: false };
  const plain = findPartData(payload, "text/plain");
  if (plain) {
    const r = base64UrlDecode(plain);
    return { body: r.text, decodeFailed: r.failed };
  }
  const html = findPartData(payload, "text/html");
  if (html) {
    const r = base64UrlDecode(html);
    return { body: r.failed ? "" : stripHtml(r.text), decodeFailed: r.failed };
  }
  if (payload.body?.data) {
    const r = base64UrlDecode(payload.body.data);
    const body = r.failed
      ? ""
      : payload.mimeType === "text/html"
        ? stripHtml(r.text)
        : r.text;
    return { body, decodeFailed: r.failed };
  }
  return { body: "", decodeFailed: false };
}

function geminiErrorToReason(
  error: GeminiErrorType | undefined,
  hasResponse: boolean,
): EmailLogReasonType | undefined {
  if (error === GEMINI_ERROR.TIMEOUT) return EMAIL_LOG_REASON.GEMINI_TIMEOUT;
  if (error === GEMINI_ERROR.TRUNCATED)
    return EMAIL_LOG_REASON.GEMINI_TRUNCATED;
  if (
    error === GEMINI_ERROR.SERVICE_UNAVAILABLE ||
    error === GEMINI_ERROR.RATE_LIMITED ||
    error === GEMINI_ERROR.UNKNOWN
  ) {
    return EMAIL_LOG_REASON.GEMINI_UNAVAILABLE;
  }
  return hasResponse ? undefined : EMAIL_LOG_REASON.NO_PARSER_MATCHED;
}

export async function syncGmailTransactions(): Promise<SyncResult> {
  return withTrace("gmail_sync", async () => {
    const accessToken = await getValidAccessToken();
    if (!accessToken) throw new Error("Not authenticated");

    const activeBanks = await getActiveBanksWithEmails();
    if (activeBanks.length === 0) return emptyResult(true);

    const emailToBank = new Map<
      string,
      { name: string; parserKey: string | null }
    >();
    const allEmails: string[] = [];
    for (const bank of activeBanks) {
      for (const e of bank.emails) {
        const lower = e.email.toLowerCase();
        emailToBank.set(lower, { name: bank.name, parserKey: bank.parser_key });
        allEmails.push(e.email);
      }
    }

    // Cap the sync lookback at 1 month back from today. Without this:
    //   - first sync (no cursor) pulls from start-of-month, which can be only
    //     a few days of data and feels empty, OR
    //   - a stale cursor (user reinstalled / opened the app after weeks) pulls
    //     months of email, blowing Gemini quota and slowing the first sync.
    // 1 month is enough to seed the app meaningfully without overwhelming
    // either the API or the user.
    const syncFromCursor = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const cursorDate = syncFromCursor ? new Date(syncFromCursor) : oneMonthAgo;
    const sinceDate =
      cursorDate.getTime() < oneMonthAgo.getTime() ? oneMonthAgo : cursorDate;
    const formatted = String(Math.floor(sinceDate.getTime() / 1000));

    const allCategories = await getAllCategories();
    const categoryNames = allCategories.map((c) => c.name);

    const activeTag = await getActiveTag();

    function matchCategoryId(
      name: string | undefined,
      type: "expense" | "income",
    ): number | null {
      const needle = (name ?? "other").toLowerCase();
      const match = allCategories.find(
        (c) => c.name.toLowerCase() === needle && c.type === type,
      );
      return match?.id ?? null;
    }

    const result = emptyResult();

    // Fetch per-sender (Gmail's combined `from:a OR from:b` query is unreliable)
    const seenIds = new Set<string>();
    const messages: { id: string }[] = [];
    for (const sender of allEmails) {
      try {
        const query = `from:${sender} after:${formatted}`;
        const listResponse = await fetch(
          `${GMAIL_API.MESSAGES}?q=${encodeURIComponent(query)}&maxResults=50`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const listData = (await listResponse.json()) as {
          messages?: { id: string }[];
        };
        for (const m of listData.messages ?? []) {
          if (seenIds.has(m.id)) continue;
          seenIds.add(m.id);
          messages.push(m);
        }
      } catch (err) {
        result.failed++;
        result.emailLogs.push({
          id: `query-${sender}`,
          from: sender,
          subject: "",
          parsedBy: "failed",
          status: EMAIL_LOG_STATUS.FAILED,
          errorMessage: String(err).slice(0, 200),
        });
      }
    }

    if (messages.length === 0) {
      await updateConfig(
        CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
        new Date().toISOString(),
      );
      return result;
    }

    for (const message of messages) {
      let from = "";
      let subject = "";
      try {
        const msgResponse = await fetch(
          `${GMAIL_API.MESSAGES}/${message.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const msgData = await msgResponse.json();
        const headers = msgData.payload?.headers as
          | { name: string; value: string }[]
          | undefined;
        from = senderEmail(extractHeader(headers, "From"));
        subject = extractHeader(headers, "Subject");
        const snippet: string = msgData.snippet ?? "";
        const extracted = extractBody(msgData.payload);
        const body: string = extracted.body || snippet;

        const existing = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.gmail_message_id, message.id))
          .limit(1);

        if (existing.length > 0) {
          result.skipped++;
          result.emailLogs.push({
            id: message.id,
            from,
            subject,
            parsedBy: PARSED_BY.REGEX,
            status: EMAIL_LOG_STATUS.DUPLICATE,
          });
          continue;
        }

        const bankInfo = emailToBank.get(from);
        const parserKey = bankInfo?.parserKey ?? null;

        const outcome = await parseEmailWithFallback(
          body,
          parserKey,
          categoryNames,
        );

        if (!outcome.parsed) {
          result.failed++;
          // Prefer the more specific decode/empty-body reason when the MIME
          // payload couldn't be decoded, otherwise fall back to Gemini/parser
          // reason mapping.
          let reason = geminiErrorToReason(
            outcome.geminiError,
            Boolean(outcome.geminiResponse),
          );
          if (!outcome.geminiResponse) {
            if (extracted.decodeFailed) {
              reason = EMAIL_LOG_REASON.DECODE_ERROR;
            } else if (!extracted.body && !snippet) {
              reason = EMAIL_LOG_REASON.EMPTY_BODY;
            }
          }
          result.emailLogs.push({
            id: message.id,
            from,
            subject,
            parsedBy: outcome.parsedBy,
            status: outcome.geminiResponse
              ? EMAIL_LOG_STATUS.NOT_TRANSACTION
              : EMAIL_LOG_STATUS.FAILED,
            geminiResponse: outcome.geminiResponse,
            reason,
            body,
          });
          continue;
        }

        const trimmedSnippet = snippet.trim();
        const note = trimmedSnippet
          ? trimmedSnippet.slice(0, MAX_NOTE_CHARS)
          : GMAIL_SYNC_NOTE;

        const matchedCategoryId = matchCategoryId(
          outcome.parsed.category,
          outcome.parsed.type,
        );

        // If the parsed date is null, use the email's internalDate as fallback
        const fallbackDate = outcome.parsed.date
          ? outcome.parsed.date
          : msgData.internalDate
            ? format(new Date(Number(msgData.internalDate)), "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd");

        const insertResult = await db.insert(transactions).values({
          amount: outcome.parsed.amount,
          merchant: outcome.parsed.merchant,
          category_id: matchedCategoryId,
          source_id: null,
          gmail_message_id: message.id,
          parsed_by:
            outcome.parsedBy === PARSED_BY.GEMINI
              ? PARSED_BY.GEMINI
              : PARSED_BY.REGEX,
          date: fallbackDate,
          // store the original email snippet so the user can see exactly what was parsed
          note,
          type: outcome.parsed.type,
          source_type: "synced",
        });

        if (activeTag) {
          const insertedId = Number(insertResult.lastInsertRowId);
          if (Number.isFinite(insertedId) && insertedId > 0) {
            await db.insert(transactionTags).values({
              transaction_id: insertedId,
              tag_id: activeTag.id,
            });
          }
        }

        // Auto-create a subscription row when Gemini flags the email as
        // recurring — skip if one already exists for the same merchant + cycle
        // (dedup by case-insensitive name + billing_day) to avoid duplicating
        // a Netflix row every month.
        if (
          outcome.parsed.is_subscription &&
          outcome.parsed.billing_day &&
          outcome.parsed.merchant &&
          outcome.parsed.type === "expense"
        ) {
          const merchantLower = outcome.parsed.merchant.toLowerCase();
          const billingDay = outcome.parsed.billing_day;
          const subAmount = outcome.parsed.amount;
          const subMerchant = outcome.parsed.merchant;
          // Wrap SELECT + INSERT in a transaction so parallel gmail syncs
          // (manual trigger + background sync) can't both see "no existing
          // row" and race to insert duplicate subscription entries.
          await expo.withTransactionAsync(async () => {
            const existingSub = await db
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(
                and(
                  sql`lower(${subscriptions.name}) = ${merchantLower}`,
                  eq(subscriptions.billing_day, billingDay),
                ),
              )
              .limit(1);

            if (existingSub.length === 0) {
              await db.insert(subscriptions).values({
                name: subMerchant,
                amount: subAmount,
                billing_day: billingDay,
                billing_days: JSON.stringify([billingDay]),
                category_id: matchedCategoryId,
                source_id: null,
              });
            }
          });
        }

        result.added++;
        result.emailLogs.push({
          id: message.id,
          from,
          subject,
          parsedBy: outcome.parsedBy,
          status: EMAIL_LOG_STATUS.ADDED,
          transaction: {
            amount: outcome.parsed.amount,
            merchant: outcome.parsed.merchant,
            date: fallbackDate,
          },
          geminiResponse:
            outcome.parsedBy === PARSED_BY.GEMINI
              ? outcome.geminiResponse
              : undefined,
          confidence: outcome.parsed.confidence,
        });
      } catch (err) {
        logFirebaseError(err, {
          error_type: ERROR_TYPE.SYNC,
          operation: "gmail_sync",
          stage: "process_message",
        });
        result.failed++;
        result.emailLogs.push({
          id: message.id,
          from: from || "(unknown)",
          subject,
          parsedBy: "failed",
          status: EMAIL_LOG_STATUS.FAILED,
          errorMessage: String(err).slice(0, 200),
        });
      }
    }

    await updateConfig(
      CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
      new Date().toISOString(),
    );

    return result;
  });
}

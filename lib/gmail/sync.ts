import { and, eq } from "drizzle-orm";
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
} from "@/lib/constants";
import { db } from "@/lib/db";
import { getActiveBanksWithEmails } from "@/lib/db/banks";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { getValidAccessToken } from "./auth";
import { type ParseSource, parseEmailWithFallback } from "./parsers";

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
  reason?: EmailLogReasonType;
  errorMessage?: string;
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

function geminiErrorToReason(
  error: GeminiErrorType | undefined,
  hasResponse: boolean,
): EmailLogReasonType | undefined {
  if (error === GEMINI_ERROR.TIMEOUT) return EMAIL_LOG_REASON.GEMINI_TIMEOUT;
  if (error === GEMINI_ERROR.TRUNCATED)
    return EMAIL_LOG_REASON.GEMINI_TRUNCATED;
  if (
    error === GEMINI_ERROR.SERVICE_UNAVAILABLE ||
    error === GEMINI_ERROR.RATE_LIMITED
  ) {
    return EMAIL_LOG_REASON.GEMINI_UNAVAILABLE;
  }
  return hasResponse ? undefined : EMAIL_LOG_REASON.NO_PARSER_MATCHED;
}

export async function syncGmailTransactions(): Promise<SyncResult> {
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

  const syncFromCursor = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
  const sinceDate = syncFromCursor
    ? new Date(syncFromCursor)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const formatted = `${sinceDate.getFullYear()}/${sinceDate.getMonth() + 1}/${sinceDate.getDate()}`;

  const defaultCategory = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, "other"), eq(categories.type, "expense")))
    .limit(1);

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
        `${GMAIL_API.MESSAGES}/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
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
      const body: string = msgData.snippet ?? "";

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
          parsedBy: "regex",
          status: EMAIL_LOG_STATUS.DUPLICATE,
        });
        continue;
      }

      const bankInfo = emailToBank.get(from);
      const parserKey = bankInfo?.parserKey ?? null;

      const outcome = await parseEmailWithFallback(body, parserKey);

      if (!outcome.parsed) {
        result.failed++;
        result.emailLogs.push({
          id: message.id,
          from,
          subject,
          parsedBy: outcome.parsedBy,
          status: outcome.geminiResponse
            ? EMAIL_LOG_STATUS.NOT_TRANSACTION
            : EMAIL_LOG_STATUS.FAILED,
          geminiResponse: outcome.geminiResponse,
          reason: geminiErrorToReason(
            outcome.geminiError,
            Boolean(outcome.geminiResponse),
          ),
        });
        continue;
      }

      await db.insert(transactions).values({
        amount: outcome.parsed.amount,
        merchant: outcome.parsed.merchant,
        category_id: defaultCategory[0]?.id ?? null,
        source_id: null,
        gmail_message_id: message.id,
        date: outcome.parsed.date,
        note: GMAIL_SYNC_NOTE,
        type: outcome.parsed.type,
        source_type: "synced",
      });

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
          date: outcome.parsed.date,
        },
        geminiResponse:
          outcome.parsedBy === "gemini" ? outcome.geminiResponse : undefined,
      });
    } catch (err) {
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
}

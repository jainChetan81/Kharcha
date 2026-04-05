import { and, eq } from "drizzle-orm";
import {
  BANK_SENDERS,
  CONFIG_KEYS,
  GMAIL_API,
  GMAIL_SYNC_NOTE,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { parseTransactionWithGemini } from "@/lib/gemini/parser";
import { getValidAccessToken } from "./auth";
import { parseEmail } from "./parsers";
import { filterEmail } from "./parsers/filter";

export interface SyncEmailDetail {
  id: string;
  sender: string;
  text: string;
}

export interface SyncResult {
  added: number;
  skipped: number;
  filtered: number;
  failed: number;
  expenseCount: number;
  expenseTotal: number;
  incomeCount: number;
  incomeTotal: number;
  addedEmails: SyncEmailDetail[];
  failedEmails: SyncEmailDetail[];
  filteredEmails: SyncEmailDetail[];
}

export async function syncGmailTransactions(): Promise<SyncResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  const lastSyncedAt = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);

  const defaultCategory = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, "other"), eq(categories.type, "expense")))
    .limit(1);

  const result: SyncResult = {
    added: 0,
    skipped: 0,
    filtered: 0,
    failed: 0,
    expenseCount: 0,
    expenseTotal: 0,
    incomeCount: 0,
    incomeTotal: 0,
    addedEmails: [],
    failedEmails: [],
    filteredEmails: [],
  };

  for (const sender of BANK_SENDERS) {
    try {
      const sinceDate = lastSyncedAt
        ? new Date(lastSyncedAt)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const formatted = `${sinceDate.getFullYear()}/${sinceDate.getMonth() + 1}/${sinceDate.getDate()}`;
      const query = `from:${sender} after:${formatted}`;

      const listResponse = await fetch(
        `${GMAIL_API.MESSAGES}?q=${encodeURIComponent(query)}&maxResults=50`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const listData = await listResponse.json();

      if (!listData.messages) continue;

      for (const message of listData.messages) {
        try {
          const msgResponse = await fetch(
            `${GMAIL_API.MESSAGES}/${message.id}?format=metadata&metadataHeaders=Subject`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          const msgData = await msgResponse.json();
          const body = msgData.snippet ?? "";

          if (!body) {
            result.filtered++;
            result.filteredEmails.push({
              id: message.id,
              sender,
              text: "empty email",
            });
            continue;
          }

          const filterResult = filterEmail(body);
          if (!filterResult.accepted) {
            result.filtered++;
            result.filteredEmails.push({
              id: message.id,
              sender,
              text: filterResult.reason ?? "unknown",
            });
            continue;
          }

          const existing = await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.gmail_message_id, message.id))
            .limit(1);

          if (existing.length > 0) {
            result.skipped++;
            continue;
          }

          let parsed = parseEmail(sender, body);

          if (!parsed) {
            console.log(
              `[Sync] regex failed, trying Gemini for ${sender}:`,
              body.slice(0, 100),
            );
            const geminiResult = await parseTransactionWithGemini(body);
            if (geminiResult) {
              parsed = {
                ...geminiResult,
                merchant: geminiResult.merchant ?? "Unknown",
              };
            }
          }

          if (!parsed) {
            console.log(
              `[Sync] Failed to parse from ${sender}:`,
              body.slice(0, 300),
            );
            result.failed++;
            result.failedEmails.push({
              id: message.id,
              sender,
              text: body.slice(0, 100),
            });
            continue;
          }

          await db.insert(transactions).values({
            amount: parsed.amount,
            merchant: parsed.merchant,
            category_id: defaultCategory[0]?.id ?? null,
            source_id: null,
            gmail_message_id: message.id,
            date: parsed.date,
            note: GMAIL_SYNC_NOTE,
            type: parsed.type,
            source_type: "synced",
          });

          result.added++;
          result.addedEmails.push({
            id: message.id,
            sender,
            text: `${parsed.merchant} — ${parsed.amount}`,
          });
          if (parsed.type === "expense") {
            result.expenseCount++;
            result.expenseTotal += parsed.amount;
          } else {
            result.incomeCount++;
            result.incomeTotal += parsed.amount;
          }
        } catch (err) {
          result.failed++;
          result.failedEmails.push({
            id: message.id,
            sender,
            text: String(err).slice(0, 100),
          });
        }
      }
    } catch (err) {
      result.failed++;
      result.failedEmails.push({
        id: `sender-${sender}`,
        sender,
        text: String(err).slice(0, 100),
      });
    }
  }

  await updateConfig(
    CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
    new Date().toISOString(),
  );

  return result;
}

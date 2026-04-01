import { and, eq, sql } from "drizzle-orm";
import {
  BANK_SENDERS,
  CONFIG_KEYS,
  GMAIL_API,
  GMAIL_SYNC_NOTE,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { getValidAccessToken } from "./auth";
import { parseEmail } from "./parsers";

export interface SyncResult {
  added: number;
  skipped: number;
  failed: number;
  expenseCount: number;
  expenseTotal: number;
  incomeCount: number;
  incomeTotal: number;
  failedEmails: string[];
  addedEmails: string[];
}

export async function syncGmailTransactions(): Promise<SyncResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  const lastSyncedAt = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
  const result: SyncResult = {
    added: 0,
    skipped: 0,
    failed: 0,
    expenseCount: 0,
    expenseTotal: 0,
    incomeCount: 0,
    incomeTotal: 0,
    failedEmails: [],
    addedEmails: [],
  };

  const defaultCategory = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, "other"), eq(categories.type, "expense")))
    .limit(1);

  for (const sender of BANK_SENDERS) {
    try {
      const sinceDate = lastSyncedAt
        ? new Date(lastSyncedAt)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const formatted = `${sinceDate.getFullYear()}/${sinceDate.getMonth() + 1}/${sinceDate.getDate()}`;
      const query = `from:${sender} after:${formatted}`;

      const listResponse = await fetch(
        `${GMAIL_API.MESSAGES}?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listResponse.json();

      if (!listData.messages) continue;

      for (const message of listData.messages) {
        try {
          const msgResponse = await fetch(
            `${GMAIL_API.MESSAGES}/${message.id}?format=metadata&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const msgData = await msgResponse.json();

          const body = msgData.snippet ?? "";

          if (!body) {
            result.failed++;
            continue;
          }

          const parsed = parseEmail(sender, body);
          if (!parsed) {
            console.log(
              `[Sync] Failed to parse from ${sender}:`,
              body.slice(0, 300),
            );
            result.failedEmails.push(`${sender}: ${body.slice(0, 80)}...`);
            result.failed++;
            continue;
          }

          const existing = await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.date, parsed.date),
                eq(transactions.amount, parsed.amount),
                sql`${transactions.note} = ${GMAIL_SYNC_NOTE}`,
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            result.skipped++;
            continue;
          }

          await db.insert(transactions).values({
            amount: parsed.amount,
            merchant: parsed.merchant,
            category_id: defaultCategory[0]?.id ?? null,
            source_id: null,
            date: parsed.date,
            note: GMAIL_SYNC_NOTE,
            type: parsed.type,
            source_type: "synced",
          });

          result.added++;
          result.addedEmails.push(`${parsed.merchant}: ${parsed.amount}`);
          if (parsed.type === "expense") {
            result.expenseCount++;
            result.expenseTotal += parsed.amount;
          } else {
            result.incomeCount++;
            result.incomeTotal += parsed.amount;
          }
        } catch (error) {
          console.error(`[Sync] Failed to process message:`, error);
          result.failed++;
        }
      }
    } catch (error) {
      console.error(`[Sync] Failed to fetch emails from ${sender}:`, error);
      result.failed++;
    }
  }

  await updateConfig(
    CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
    new Date().toISOString(),
  );

  return result;
}

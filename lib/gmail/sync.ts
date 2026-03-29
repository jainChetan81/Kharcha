import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { getValidAccessToken } from "./auth";
import { parseEmail } from "./parser";

const BANK_SENDERS = [
  "alerts@axis.bank.com",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
  "alerts@hdfcbank.bank.in",
];

export interface SyncResult {
  added: number;
  skipped: number;
  failed: number;
  expenseCount: number;
  expenseTotal: number;
  incomeCount: number;
  incomeTotal: number;
}

export async function syncGmailTransactions(): Promise<SyncResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  const lastSyncedAt = await getConfig("gmail_last_synced_at");
  const result: SyncResult = {
    added: 0,
    skipped: 0,
    failed: 0,
    expenseCount: 0,
    expenseTotal: 0,
    incomeCount: 0,
    incomeTotal: 0,
  };

  for (const sender of BANK_SENDERS) {
    try {
      const sinceDate = lastSyncedAt
        ? new Date(lastSyncedAt)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const formatted = `${sinceDate.getFullYear()}/${sinceDate.getMonth() + 1}/${sinceDate.getDate()}`;
      const query = `from:${sender} after:${formatted}`;

      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listResponse.json();

      if (!listData.messages) {
        continue;
      }

      for (const message of listData.messages) {
        try {
          const msgResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject`,
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
                sql`${transactions.note} = 'synced from gmail'`,
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            result.skipped++;
            continue;
          }

          const defaultCategory = await db
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(eq(categories.name, "other"), eq(categories.type, "expense")),
            )
            .limit(1);

          await db.insert(transactions).values({
            amount: parsed.amount,
            merchant: parsed.merchant,
            category_id: defaultCategory[0]?.id ?? null,
            source_id: null,
            date: parsed.date,
            note: "synced from gmail",
            type: parsed.type,
            source_type: "synced",
          });

          result.added++;
          if (parsed.type === "expense") {
            result.expenseCount++;
            result.expenseTotal += parsed.amount;
          } else {
            result.incomeCount++;
            result.incomeTotal += parsed.amount;
          }
        } catch {
          result.failed++;
        }
      }
    } catch {
      result.failed++;
    }
  }

  await updateConfig("gmail_last_synced_at", new Date().toISOString());

  return result;
}

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { getValidAccessToken } from "./auth";
import { parseEmail } from "./parser";

const BANK_SENDERS = [
  "alerts@axisbank.com",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
];

export interface SyncResult {
  added: number;
  skipped: number;
  failed: number;
}

export async function syncGmailTransactions(): Promise<SyncResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  const lastSyncedAt = await getConfig("gmail_last_synced_at");
  const result: SyncResult = { added: 0, skipped: 0, failed: 0 };

  for (const sender of BANK_SENDERS) {
    try {
      let query = `from:${sender}`;
      if (lastSyncedAt) {
        const date = new Date(lastSyncedAt);
        const formatted = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
        query += ` after:${formatted}`;
      }

      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const listData = await listResponse.json();
      if (!listData.messages) continue;

      for (const message of listData.messages) {
        try {
          const msgResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const msgData = await msgResponse.json();

          const parts = msgData.payload?.parts || [msgData.payload];
          let body = "";
          for (const part of parts) {
            if (part?.mimeType === "text/plain" && part?.body?.data) {
              body = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
              break;
            }
          }

          if (!body) continue;

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
          });

          result.added++;
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

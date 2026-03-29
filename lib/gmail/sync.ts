import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { categories, transactions } from "@/lib/db/schema";
import { getValidAccessToken } from "./auth";
import { parseEmail } from "./parser";

const BANK_SENDERS = ["alerts@axis.bank.com", "alerts@hdfcbank.net", "alerts@hdfcbank.com", "alerts@hdfcbank.bank.in"];

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
	console.log("[Sync] Starting gmail sync...");
	const accessToken = await getValidAccessToken();
	if (!accessToken) throw new Error("Not authenticated");

	const lastSyncedAt = await getConfig("gmail_last_synced_at");
	console.log("[Sync] Last synced at:", lastSyncedAt ?? "never");
	const result: SyncResult = { added: 0, skipped: 0, failed: 0, expenseCount: 0, expenseTotal: 0, incomeCount: 0, incomeTotal: 0 };

	for (const sender of BANK_SENDERS) {
		try {
			const sinceDate = lastSyncedAt ? new Date(lastSyncedAt) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			const formatted = `${sinceDate.getFullYear()}/${sinceDate.getMonth() + 1}/${sinceDate.getDate()}`;
			const query = `from:${sender} after:${formatted}`;

			console.log("[Sync] Query:", query);

			const listResponse = await fetch(
				`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
				{ headers: { Authorization: `Bearer ${accessToken}` } }
			);
			const listData = await listResponse.json();

			if (!listData.messages) {
				console.log("[Sync]", sender, "— no messages found");
				continue;
			}

			console.log("[Sync]", sender, "—", listData.messages.length, "messages found");

			for (const message of listData.messages) {
				try {
					const msgResponse = await fetch(
						`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject`,
						{ headers: { Authorization: `Bearer ${accessToken}` } }
					);
					const msgData = await msgResponse.json();

					const subject =
						msgData.payload?.headers?.find((h: { name: string }) => h.name.toLowerCase() === "subject")?.value ?? "no subject";

					const body = msgData.snippet ?? "";
					console.log("[Sync] Email:", subject);
					console.log("[Sync] Snippet:", body);

					if (!body) {
						console.log("[Sync] No snippet for:", subject);
						result.failed++;
						continue;
					}

					console.log("[Sync] Parsing email:", subject);
					const parsed = parseEmail(sender, body);
					if (!parsed) {
						console.log("[Sync] Failed to parse:", subject, "— body length:", body.length);
						result.failed++;
						continue;
					}

					console.log("[Sync] Parsed:", parsed.type, parsed.amount, parsed.merchant, parsed.date);

					const existing = await db
						.select({ id: transactions.id })
						.from(transactions)
						.where(
							and(
								eq(transactions.date, parsed.date),
								eq(transactions.amount, parsed.amount),
								sql`${transactions.note} = 'synced from gmail'`
							)
						)
						.limit(1);

					if (existing.length > 0) {
						console.log("[Sync] Duplicate, skipping:", parsed.merchant, parsed.amount);
						result.skipped++;
						continue;
					}

					const defaultCategory = await db
						.select({ id: categories.id })
						.from(categories)
						.where(and(eq(categories.name, "other"), eq(categories.type, "expense")))
						.limit(1);

					await db.insert(transactions).values({
						amount: parsed.amount,
						merchant: parsed.merchant,
						category_id: defaultCategory[0]?.id ?? null,
						source_id: null,
						date: parsed.date,
						note: "synced from gmail",
						type: parsed.type,
						source_type: "synced"
					});

					console.log("[Sync] Added:", parsed.type, parsed.amount, parsed.merchant);
					result.added++;
					if (parsed.type === "expense") {
						result.expenseCount++;
						result.expenseTotal += parsed.amount;
					} else {
						result.incomeCount++;
						result.incomeTotal += parsed.amount;
					}
				} catch (err) {
					console.log("[Sync] Error processing message:", err);
					result.failed++;
				}
			}
		} catch (err) {
			console.log("[Sync] Error fetching from", sender, ":", err);
			result.failed++;
		}
	}

	await updateConfig("gmail_last_synced_at", new Date().toISOString());
	console.log("[Sync] Complete:", JSON.stringify(result));

	return result;
}

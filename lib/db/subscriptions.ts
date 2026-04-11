import { format, getDaysInMonth } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { MONTH_FORMAT, SUBSCRIPTION_NOTE } from "@/lib/constants";
import expo, { db } from "./connection";
import { categories, sources, subscriptions, transactions } from "./schema";
import type { SubscriptionRow } from "./types";

export type { SubscriptionRow };

function subscriptionSelect() {
  return db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amount: subscriptions.amount,
      billing_day: subscriptions.billing_day,
      category_id: subscriptions.category_id,
      source_id: subscriptions.source_id,
      is_active: subscriptions.is_active,
      created_at: subscriptions.created_at,
      category_name: categories.name,
      source_name: sources.name,
    })
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.category_id, categories.id))
    .leftJoin(sources, eq(subscriptions.source_id, sources.id));
}

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  return (await subscriptionSelect()) as SubscriptionRow[];
}

export async function getSubscriptionById(
  id: number,
): Promise<SubscriptionRow | null> {
  const rows = await subscriptionSelect().where(eq(subscriptions.id, id));
  return (rows[0] as SubscriptionRow) ?? null;
}

export async function addSubscription(params: {
  name: string;
  amount: number;
  billingDay: number;
  categoryId: number | null;
  sourceId: number | null;
}) {
  return db.insert(subscriptions).values({
    name: params.name,
    amount: params.amount,
    billing_day: params.billingDay,
    category_id: params.categoryId,
    source_id: params.sourceId,
  });
}

export async function updateSubscription(
  id: number,
  params: {
    name: string;
    amount: number;
    billingDay: number;
    categoryId: number | null;
    sourceId: number | null;
  },
) {
  return db
    .update(subscriptions)
    .set({
      name: params.name,
      amount: params.amount,
      billing_day: params.billingDay,
      category_id: params.categoryId,
      source_id: params.sourceId,
    })
    .where(eq(subscriptions.id, id));
}

export async function deleteSubscription(id: number) {
  await expo.withTransactionAsync(async () => {
    await db.delete(transactions).where(eq(transactions.subscription_id, id));
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
  });
}

export async function toggleSubscription(id: number, isActive: boolean) {
  return db
    .update(subscriptions)
    .set({ is_active: isActive ? 1 : 0 })
    .where(eq(subscriptions.id, id));
}

export async function getActiveSubscriptionsTotal(): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${subscriptions.amount}), 0)`,
    })
    .from(subscriptions)
    .where(eq(subscriptions.is_active, 1));
  return rows[0]?.total ?? 0;
}

export async function processSubscriptions(): Promise<string[]> {
  const now = new Date();
  const today = now.getDate();
  const yearMonth = format(now, MONTH_FORMAT);
  const daysInMonth = getDaysInMonth(now);
  const created: string[] = [];

  await expo.withTransactionAsync(async () => {
    const activeSubs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.is_active, 1));

    const existingTxns = await db
      .select({
        subscription_id: transactions.subscription_id,
      })
      .from(transactions)
      .where(
        and(
          sql`${transactions.subscription_id} IS NOT NULL`,
          sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
        ),
      );

    const existingSubIds = new Set(existingTxns.map((t) => t.subscription_id));

    for (const sub of activeSubs) {
      const effectiveDay = Math.min(sub.billing_day, daysInMonth);
      if (effectiveDay > today) continue;
      if (existingSubIds.has(sub.id)) continue;

      const billingDate = `${yearMonth}-${String(effectiveDay).padStart(2, "0")}`;

      await db.insert(transactions).values({
        type: "expense",
        amount: sub.amount,
        merchant: sub.name,
        category_id: sub.category_id,
        source_id: sub.source_id,
        subscription_id: sub.id,
        source_type: "recurring",
        date: billingDate,
        note: SUBSCRIPTION_NOTE,
      });

      created.push(sub.name);
    }
  });

  return created;
}

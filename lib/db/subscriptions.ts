import { format, getDaysInMonth } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  type Subscription,
  sources,
  subscriptions,
  transactions,
} from "./schema";

export type SubscriptionRow = Subscription & {
  category_name: string | null;
  source_name: string | null;
};

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  const rows = await db
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

  return rows as SubscriptionRow[];
}

export async function getSubscriptionById(
  id: number,
): Promise<SubscriptionRow | null> {
  const rows = await db
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
    .leftJoin(sources, eq(subscriptions.source_id, sources.id))
    .where(eq(subscriptions.id, id));

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
  await db.delete(transactions).where(eq(transactions.subscription_id, id));
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
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
  const yearMonth = format(now, "yyyy-MM");
  const daysInMonth = getDaysInMonth(now);

  const activeSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.is_active, 1));

  const created: string[] = [];

  for (const sub of activeSubs) {
    const effectiveDay = Math.min(sub.billing_day, daysInMonth);
    if (effectiveDay > today) continue;

    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.subscription_id, sub.id),
          sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    const billingDate = `${yearMonth}-${String(effectiveDay).padStart(2, "0")}`;

    await db.insert(transactions).values({
      type: "expense",
      amount: sub.amount,
      merchant: sub.name,
      category_id: sub.category_id,
      source_id: sub.source_id,
      subscription_id: sub.id,
      date: billingDate,
      note: "Auto-created from subscription",
    });

    created.push(sub.name);
  }

  return created;
}

import { format, getDaysInMonth, subDays } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import {
  DATE_ISO_FORMAT,
  INVESTMENT_KIND,
  MONTH_FORMAT,
  SUBSCRIPTION_NOTE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import {
  ERROR_TYPE,
  FIREBASE_EVENTS,
  logEvent,
  logFirebaseError,
} from "@/lib/firebase";
import { subscriptionInputSchema } from "@/lib/validation";
import expo, { db } from "./connection";
import { safeRecomputeHolding } from "./holdings";
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
      type: subscriptions.type,
      holding_id: subscriptions.holding_id,
      investment_kind: subscriptions.investment_kind,
      default_units: subscriptions.default_units,
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

export type SubscriptionMutationInput = {
  name: string;
  amount: number;
  billingDay: number;
  categoryId: number | null;
  sourceId: number | null;
  type?: "expense" | "investment";
  holdingId?: number | null;
  investmentKind?: "buy" | "sell" | "dividend" | "interest" | null;
  defaultUnits?: number | null;
};

export async function addSubscription(params: SubscriptionMutationInput) {
  const validation = subscriptionInputSchema.safeParse(params);
  if (!validation.success) {
    throw new Error(
      `Invalid subscription: ${validation.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  const v = validation.data;
  const isInvestment = v.type === "investment";
  return db.insert(subscriptions).values({
    name: v.name,
    amount: v.amount,
    billing_day: v.billingDay,
    // SIPs ignore category: the generated tx is type=investment, which is
    // excluded from category pies anyway. Keep null to avoid stale wiring if
    // the user later flips the subscription back to expense.
    category_id: isInvestment ? null : v.categoryId,
    source_id: v.sourceId,
    type: v.type,
    holding_id: isInvestment ? (v.holdingId ?? null) : null,
    investment_kind: isInvestment
      ? (v.investmentKind ?? INVESTMENT_KIND.BUY)
      : null,
    default_units: isInvestment ? (v.defaultUnits ?? null) : null,
  });
}

export async function updateSubscription(
  id: number,
  params: SubscriptionMutationInput,
) {
  const validation = subscriptionInputSchema.safeParse(params);
  if (!validation.success) {
    throw new Error(
      `Invalid subscription: ${validation.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  const v = validation.data;
  const isInvestment = v.type === "investment";
  return db
    .update(subscriptions)
    .set({
      name: v.name,
      amount: v.amount,
      billing_day: v.billingDay,
      category_id: isInvestment ? null : v.categoryId,
      source_id: v.sourceId,
      type: v.type,
      holding_id: isInvestment ? (v.holdingId ?? null) : null,
      investment_kind: isInvestment
        ? (v.investmentKind ?? INVESTMENT_KIND.BUY)
        : null,
      default_units: isInvestment ? (v.defaultUnits ?? null) : null,
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

      // Guard against concurrent calls: verify no transaction was inserted
      // between the batch query and this point
      const [existing] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.subscription_id, sub.id),
            sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
          ),
        )
        .limit(1);
      if (existing) continue;

      const billingDate = `${yearMonth}-${String(effectiveDay).padStart(2, "0")}`;
      // A SIP whose holding was detached (holding row missing, or a bug
      // cleared the FK) would otherwise fall through to an expense post with
      // category_id=null — a mystery ₹X row the user can't explain. Skip and
      // forward to crashlytics so the drift is visible instead of silently
      // generating ghost expenses.
      if (sub.type === TRANSACTION_TYPE.INVESTMENT && sub.holding_id == null) {
        logFirebaseError(new Error("SIP has no holding_id, skipping"), {
          error_type: ERROR_TYPE.DB,
          operation: "processSubscriptions",
          subscription_id: String(sub.id),
        });
        logEvent(FIREBASE_EVENTS.SIP_SKIPPED_NO_HOLDING, {
          subscription_id: sub.id,
        });
        continue;
      }
      const isInvestmentSub =
        sub.type === TRANSACTION_TYPE.INVESTMENT && sub.holding_id != null;

      await db.insert(transactions).values({
        type: isInvestmentSub
          ? TRANSACTION_TYPE.INVESTMENT
          : TRANSACTION_TYPE.EXPENSE,
        amount: sub.amount,
        merchant: sub.name,
        // Investment txns don't use category — the holding is the grouping.
        category_id: isInvestmentSub ? null : sub.category_id,
        source_id: sub.source_id,
        subscription_id: sub.id,
        holding_id: isInvestmentSub ? sub.holding_id : null,
        // investment_kind is effectively always BUY for auto-posted SIPs.
        // The subscription form doesn't collect a kind because dividend /
        // sell / interest are one-off events the user records manually; the
        // recurring auto-post assumes a monthly buy contribution.
        investment_kind: isInvestmentSub
          ? (sub.investment_kind ?? INVESTMENT_KIND.BUY)
          : null,
        // SIP auto-posts use the user's stored default_units as a placeholder.
        // Actual units vary with NAV — the user reconciles from the fund
        // statement by editing the generated tx.
        units: isInvestmentSub ? sub.default_units : null,
        source_type: "recurring",
        date: billingDate,
        note: SUBSCRIPTION_NOTE,
      });

      // Recompute via the safe wrapper: if the reducer throws on a bad row,
      // the other SIPs in this batch still auto-post and the whole
      // withTransactionAsync isn't rolled back just because holding math
      // choked.
      if (isInvestmentSub && sub.holding_id != null) {
        await safeRecomputeHolding(sub.holding_id, {
          operation: "processSubscriptions",
        });
        logEvent(FIREBASE_EVENTS.SIP_POSTED, {
          subscription_id: sub.id,
          holding_id: sub.holding_id,
          kind: sub.investment_kind ?? INVESTMENT_KIND.BUY,
          amount: sub.amount,
        });
      }

      // Fires for each auto-posted row so expense-sub vs SIP adoption is
      // observable in analytics — manual adds still emit TRANSACTION_ADDED
      // via useInsertTransaction, so the two paths are distinguishable.
      logEvent(FIREBASE_EVENTS.RECURRING_TRANSACTION_POSTED, {
        type: isInvestmentSub ? "investment" : "expense",
      });

      created.push(sub.name);
    }
  });

  return created;
}

export type SubscriptionAuditRow = SubscriptionRow & {
  last_charged: string | null;
};

export async function getUnusedSubscriptions(): Promise<
  SubscriptionAuditRow[]
> {
  const cutoff = format(subDays(new Date(), 60), DATE_ISO_FORMAT);

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
      last_charged: sql<string | null>`MAX(${transactions.date})`,
    })
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.category_id, categories.id))
    .leftJoin(sources, eq(subscriptions.source_id, sources.id))
    .leftJoin(transactions, eq(transactions.subscription_id, subscriptions.id))
    .where(eq(subscriptions.is_active, 1))
    .groupBy(subscriptions.id)
    .having(
      sql`MAX(${transactions.date}) IS NULL OR MAX(${transactions.date}) < ${cutoff}`,
    );

  return rows as SubscriptionAuditRow[];
}

export async function getActiveSubscriptions(): Promise<SubscriptionRow[]> {
  return (await subscriptionSelect().where(
    eq(subscriptions.is_active, 1),
  )) as SubscriptionRow[];
}

import { format, getDaysInMonth, subDays } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import {
  DATE_ISO_FORMAT,
  INVESTMENT_KIND,
  MONTH_FORMAT,
  RECURRING_DETECTION_DAYS,
  RECURRING_DETECTION_MIN_HITS,
  RECURRING_DETECTION_MIN_MONTHS,
  RECURRING_DETECTION_PRICE_TOLERANCE,
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
import {
  categories,
  sources,
  subscriptions,
  transactions,
  transactionTags,
} from "./schema";
import type { SubscriptionRow } from "./types";

export type { SubscriptionRow };

function subscriptionSelect() {
  return db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amount: subscriptions.amount,
      billing_day: subscriptions.billing_day,
      billing_days: subscriptions.billing_days,
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

/**
 * Parse the `billing_days` JSON column into a sorted, deduped, in-range array.
 * Falls back to `[billing_day]` if the column is empty or malformed — covers
 * legacy rows written before the multi-day migration as well as any corrupt
 * JSON that slipped past validation.
 */
export function parseBillingDays(
  rawJson: string | null | undefined,
  legacyBillingDay: number,
): number[] {
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        const days = parsed
          .filter(
            (n): n is number =>
              typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 31,
          )
          .sort((a, b) => a - b);
        const unique = Array.from(new Set(days));
        if (unique.length > 0) return unique;
      }
    } catch {
      // fall through to legacy value
    }
  }
  return [legacyBillingDay];
}

/**
 * Format a sorted billing-day list as a human label: `day 1`, `Day 1`,
 * `days 1, 15`, `Days 1, 15`. Three different screens were rolling this
 * conditional inline — extracted so the singular/plural rule lives in one
 * place and the casing is a simple flag.
 */
export function formatBillingDays(
  days: number[],
  { capitalize = false }: { capitalize?: boolean } = {},
): string {
  const word = days.length === 1 ? "day" : "days";
  const cased = capitalize ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
  return `${cased} ${days.join(", ")}`;
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
  billingDays: number[];
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
  const sortedDays = Array.from(new Set(v.billingDays)).sort((a, b) => a - b);
  return db.insert(subscriptions).values({
    name: v.name,
    amount: v.amount,
    // billing_day is the legacy single-day column; we keep writing it (it's
    // NOT NULL with no default) so older code paths and DB tools see a sane
    // value. Source of truth is billing_days (JSON array).
    billing_day: sortedDays[0],
    billing_days: JSON.stringify(sortedDays),
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
  const sortedDays = Array.from(new Set(v.billingDays)).sort((a, b) => a - b);
  return db
    .update(subscriptions)
    .set({
      name: v.name,
      amount: v.amount,
      billing_day: sortedDays[0],
      billing_days: JSON.stringify(sortedDays),
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
    await db
      .delete(transactionTags)
      .where(
        sql`${transactionTags.transaction_id} IN (SELECT id FROM transactions WHERE subscription_id = ${id})`,
      );
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
    .where(
      and(
        eq(subscriptions.is_active, 1),
        sql`${subscriptions.type} != ${TRANSACTION_TYPE.INVESTMENT}`,
      ),
    );
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

    // Multi-day subs need date-level dedup: a sub with [1, 15] should produce
    // two rows in a month, not one. Track which (subscription, date) pairs
    // already have a posted transaction so re-runs are idempotent and the
    // second day in a month doesn't get skipped just because the first
    // already posted.
    const existingTxns = await db
      .select({
        subscription_id: transactions.subscription_id,
        date: transactions.date,
      })
      .from(transactions)
      .where(
        and(
          sql`${transactions.subscription_id} IS NOT NULL`,
          sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
        ),
      );

    const existingDates = new Map<number, Set<string>>();
    for (const t of existingTxns) {
      if (t.subscription_id == null) continue;
      const set = existingDates.get(t.subscription_id) ?? new Set<string>();
      set.add(t.date.slice(0, 10));
      existingDates.set(t.subscription_id, set);
    }

    for (const sub of activeSubs) {
      const billingDays = parseBillingDays(sub.billing_days, sub.billing_day);

      for (const day of billingDays) {
        const effectiveDay = Math.min(day, daysInMonth);
        if (effectiveDay > today) continue;

        const billingDate = `${yearMonth}-${String(effectiveDay).padStart(2, "0")}`;
        const subExisting = existingDates.get(sub.id);
        if (subExisting?.has(billingDate)) continue;

        // Guard against concurrent calls: verify no transaction was inserted
        // between the batch query and this point.
        const [existing] = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.subscription_id, sub.id),
              eq(transactions.date, billingDate),
            ),
          )
          .limit(1);
        if (existing) continue;

        // A SIP whose holding was detached (holding row missing, or a bug
        // cleared the FK) would otherwise fall through to an expense post
        // with category_id=null — a mystery ₹X row the user can't explain.
        // Skip and forward to crashlytics so the drift is visible instead of
        // silently generating ghost expenses.
        if (
          sub.type === TRANSACTION_TYPE.INVESTMENT &&
          sub.holding_id == null
        ) {
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
          investment_kind: isInvestmentSub
            ? (sub.investment_kind ?? INVESTMENT_KIND.BUY)
            : null,
          units: isInvestmentSub ? sub.default_units : null,
          source_type: "recurring",
          date: billingDate,
          note: SUBSCRIPTION_NOTE,
        });

        // Cache locally so any later iteration of the same sub on a different
        // day in this same run sees the freshly-inserted row.
        if (subExisting) subExisting.add(billingDate);
        else existingDates.set(sub.id, new Set([billingDate]));

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

        logEvent(FIREBASE_EVENTS.RECURRING_TRANSACTION_POSTED, {
          type: isInvestmentSub ? "investment" : "expense",
        });

        created.push(sub.name);
      }
    }
  });

  return created;
}

export type SubscriptionCandidate = {
  /** Display merchant — the most-recent casing seen in the data. */
  merchant: string;
  /** Median amount across hits — robust to one outlier vs mean. */
  amount: number;
  /** Number of qualifying charges seen in the window. */
  hits: number;
  /** Distinct calendar months the charges span. */
  months: number;
  /** Most recent charge date (YYYY-MM-DD). */
  last_seen: string;
  /** Most-common day-of-month across hits — seed for billing_day. */
  suggested_day: number;
  /** Most-common source_id across hits, or null if undecided. */
  source_id: number | null;
  /** Most-common category_id across expense hits, or null if undecided. */
  category_id: number | null;
};

/**
 * Scans the last 90 days of expense transactions for merchants that look
 * like recurring charges: same-ish amount, multiple hits across distinct
 * months. Excludes merchants already linked to a subscription (matched
 * case-insensitively against subscription.name) so the suggestions list
 * doesn't re-surface what the user already wired up.
 *
 * Aggregation lives in JS instead of SQL — drizzle's expression builder
 * can't easily express the "median amount + most-common day + multi-month
 * gate" combo, and the row count is bounded by 90 days of personal
 * spending which is trivially small.
 */
export async function detectRecurringMerchants(): Promise<
  SubscriptionCandidate[]
> {
  const cutoff = format(
    subDays(new Date(), RECURRING_DETECTION_DAYS),
    DATE_ISO_FORMAT,
  );

  const [rows, existingSubs] = await Promise.all([
    db
      .select({
        merchant: transactions.merchant,
        amount: transactions.amount,
        date: transactions.date,
        source_id: transactions.source_id,
        category_id: transactions.category_id,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          sql`${transactions.subscription_id} IS NULL`,
          sql`${transactions.merchant} IS NOT NULL`,
          sql`${transactions.merchant} != ''`,
          sql`${transactions.date} >= ${cutoff}`,
        ),
      ),
    db.select({ name: subscriptions.name }).from(subscriptions),
  ]);

  const blockedNames = new Set(
    existingSubs.map((s) => s.name.trim().toLowerCase()),
  );

  type Bucket = {
    displayName: string;
    /** Date of the row that set `displayName`. Lets us compare against the
     *  bucket's max date (the query has no ORDER BY, so insertion order
     *  isn't sorted). */
    displayDate: string;
    items: {
      amount: number;
      date: string;
      source_id: number | null;
      category_id: number | null;
    }[];
  };
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const name = (row.merchant ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (blockedNames.has(key)) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { displayName: name, displayDate: row.date, items: [] };
      buckets.set(key, bucket);
    } else if (row.date > bucket.displayDate) {
      // Keep the most-recent casing as the display name so a merchant that
      // gets cleaned up over time (`SWIGGY*BANGALORE` → `Swiggy`) shows the
      // newer label.
      bucket.displayName = name;
      bucket.displayDate = row.date;
    }
    bucket.items.push({
      amount: row.amount,
      date: row.date,
      source_id: row.source_id ?? null,
      category_id: row.category_id ?? null,
    });
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.items.length < RECURRING_DETECTION_MIN_HITS) continue;

    const months = new Set(bucket.items.map((i) => i.date.slice(0, 7)));
    if (months.size < RECURRING_DETECTION_MIN_MONTHS) continue;

    const sortedAmounts = bucket.items
      .map((i) => i.amount)
      .toSorted((a, b) => a - b);
    const median = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
    if (median <= 0) continue;

    // Tolerance gate: every hit must land within ±15% of median, otherwise
    // the merchant is a variable-spend regular (Swiggy, fuel) not a fixed
    // subscription.
    const allWithinTolerance = bucket.items.every(
      (i) =>
        Math.abs(i.amount - median) / median <=
        RECURRING_DETECTION_PRICE_TOLERANCE,
    );
    if (!allWithinTolerance) continue;

    const dayCounts = new Map<number, number>();
    const sourceCounts = new Map<number, number>();
    const categoryCounts = new Map<number, number>();
    let lastSeen = "";
    for (const item of bucket.items) {
      const day = Number(item.date.slice(8, 10));
      if (Number.isFinite(day)) {
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
      if (item.source_id != null) {
        sourceCounts.set(
          item.source_id,
          (sourceCounts.get(item.source_id) ?? 0) + 1,
        );
      }
      if (item.category_id != null) {
        categoryCounts.set(
          item.category_id,
          (categoryCounts.get(item.category_id) ?? 0) + 1,
        );
      }
      if (item.date > lastSeen) lastSeen = item.date;
    }

    candidates.push({
      merchant: bucket.displayName,
      amount: Math.round(median * 100) / 100,
      hits: bucket.items.length,
      months: months.size,
      last_seen: lastSeen.slice(0, 10),
      suggested_day: topKey(dayCounts) ?? 1,
      source_id: topKey(sourceCounts),
      category_id: topKey(categoryCounts),
    });
  }

  // Sort by signal strength: most months, then most hits, then most-recent.
  // `last_seen` is YYYY-MM-DD so lexicographic compare equals chronological.
  candidates.sort(
    (a, b) =>
      b.months - a.months ||
      b.hits - a.hits ||
      b.last_seen.localeCompare(a.last_seen),
  );

  return candidates;
}

function topKey(map: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [k, v] of map) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
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
      billing_days: subscriptions.billing_days,
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

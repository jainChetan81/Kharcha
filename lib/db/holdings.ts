import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  INVESTMENT_KIND,
  isUnitlessInstrument,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { ERROR_TYPE, logFirebaseError } from "@/lib/firebase";
import expo, { db } from "./connection";
import { holdings, subscriptions, transactions } from "./schema";
import type {
  Holding,
  InstrumentType,
  InvestmentKind,
  PortfolioSummary,
} from "./types";

export async function getAllHoldings(): Promise<Holding[]> {
  return db
    .select()
    .from(holdings)
    .orderBy(asc(holdings.is_closed), asc(holdings.sort_order)) as Promise<
    Holding[]
  >;
}

export async function getHolding(id: number): Promise<Holding | null> {
  const [row] = await db
    .select()
    .from(holdings)
    .where(eq(holdings.id, id))
    .limit(1);
  return (row as Holding | undefined) ?? null;
}

export async function addHolding(input: {
  name: string;
  instrument_type: InstrumentType;
  note?: string | null;
}): Promise<{ id: number; isNew: boolean }> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("Holding name is required");
  const [existing] = await db
    .select()
    .from(holdings)
    .where(sql`LOWER(${holdings.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };
  const result = await db.insert(holdings).values({
    name: trimmed,
    instrument_type: input.instrument_type,
    note: input.note ?? null,
  });
  return { id: Number(result.lastInsertRowId), isNew: true };
}

export async function closeHolding(id: number): Promise<void> {
  await db.update(holdings).set({ is_closed: 1 }).where(eq(holdings.id, id));
}

export async function reopenHolding(id: number): Promise<void> {
  await db.update(holdings).set({ is_closed: 0 }).where(eq(holdings.id, id));
}

export async function deleteHoldingCascade(id: number): Promise<void> {
  await expo.withTransactionAsync(async () => {
    const linkedSubs = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.holding_id, id));
    for (const sub of linkedSubs) {
      await db
        .delete(transactions)
        .where(eq(transactions.subscription_id, sub.id));
      await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
    }
    await db.delete(transactions).where(eq(transactions.holding_id, id));
    await db.delete(holdings).where(eq(holdings.id, id));
  });
}

/**
 * Recompute a holding's running units, avg_cost, and invested from its
 * linked transactions. Single source of truth — the buy/sell handler calls
 * this after each mutation, and a manual "recompute" button can repair
 * drift caused by edited or deleted transactions.
 *
 * Accounting rules:
 *   buy       → units += tx.units; invested += amount; avg_cost = invested/units
 *   sell      → units -= tx.units; invested -= tx.units * avg_cost (cost basis)
 *   dividend  → no unit/cost change; tracked only as cashflow
 *   interest  → same as dividend
 */
export async function recomputeHoldingFromTransactions(
  id: number,
): Promise<void> {
  const [holding] = await db
    .select({ instrument_type: holdings.instrument_type })
    .from(holdings)
    .where(eq(holdings.id, id))
    .limit(1);
  if (!holding) return;
  const unitless = isUnitlessInstrument(holding.instrument_type);

  const rows = await db
    .select({
      kind: transactions.investment_kind,
      amount: transactions.amount,
      units: transactions.units,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.holding_id, id),
        eq(transactions.type, TRANSACTION_TYPE.INVESTMENT),
      ),
    )
    .orderBy(asc(transactions.date), asc(transactions.created_at));

  let units = 0;
  let invested = 0;

  for (const row of rows) {
    const kind = row.kind as InvestmentKind | null;
    if (!kind) continue;
    const rawAmt = Number(row.amount);
    const rawU = Number(row.units);
    // A NaN here means a corrupt row got through insertion. Fall back to 0 so
    // the reducer doesn't poison the totals, but flag it — this is a data
    // integrity signal we want visibility on rather than silently swallowing.
    // Unit-less holdings never carry a units value, so skip the NaN check on
    // that field — null coerces to NaN here but is expected.
    if (!Number.isFinite(rawAmt) || (!unitless && !Number.isFinite(rawU))) {
      logFirebaseError(new Error("Investment tx has non-finite amount/units"), {
        error_type: ERROR_TYPE.DB,
        operation: "recomputeHoldingFromTransactions",
        holding_id: String(id),
        kind,
      });
    }
    const amt = Number.isFinite(rawAmt) ? rawAmt : 0;
    const u = Number.isFinite(rawU) ? rawU : 0;
    if (unitless) {
      // Unit-less instruments (FD/PPF/Bond) treat every Buy as a capital
      // contribution and every Sell as a withdrawal. Units and avg_cost stay
      // pinned at 0 — there's no share price concept.
      if (kind === INVESTMENT_KIND.BUY) invested += amt;
      else if (kind === INVESTMENT_KIND.SELL) invested -= amt;
      if (invested < 0) invested = 0;
      continue;
    }
    if (kind === INVESTMENT_KIND.BUY) {
      units += u;
      invested += amt;
    } else if (kind === INVESTMENT_KIND.SELL) {
      const sellUnits = Math.min(u, units);
      const avgCost = units > 0 ? invested / units : 0;
      units -= sellUnits;
      invested -= sellUnits * avgCost;
      if (units <= 0) {
        units = 0;
        invested = 0;
      }
    }
  }

  const avg_cost = units > 0 ? invested / units : 0;
  await db
    .update(holdings)
    .set({ units, avg_cost, invested })
    .where(eq(holdings.id, id));
}

/**
 * Best-effort wrapper around recomputeHoldingFromTransactions: any failure is
 * reported to crashlytics and swallowed so the caller's primary mutation
 * (insert / edit / delete) still completes. Portfolio totals can drift on
 * failure, but the user's transaction is never rolled back because the
 * holding math choked.
 */
export async function safeRecomputeHolding(
  id: number,
  context: { operation: string; source?: string },
): Promise<void> {
  try {
    await recomputeHoldingFromTransactions(id);
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: context.operation,
      holding_id: String(id),
      ...(context.source ? { source: context.source } : {}),
    });
  }
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const rows = (await db
    .select()
    .from(holdings)
    .where(eq(holdings.is_closed, 0))) as Holding[];
  let invested = 0;
  for (const h of rows) {
    invested += h.invested ?? 0;
  }
  return { invested };
}

export async function getTransactionsForHolding(id: number) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.holding_id, id))
    .orderBy(desc(transactions.date), desc(transactions.created_at));
}

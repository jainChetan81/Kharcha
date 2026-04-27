import { useMemo } from "react";
import { useSubscriptionsTotal } from "@/hooks/use-subscriptions";
import {
  useMonthlyInsights,
  useMonthlySummary,
  useMonthTransactions,
  useRecentTransactions,
  useReimbursementSummary,
  useTotalMonthlyBudget,
} from "@/hooks/use-transactions";
import { RECENT_TRANSACTIONS_LIMIT } from "@/lib/constants";

// When the prior month had near-zero spending, the percentage delta
// explodes (e.g. ₹100 → ₹39k = 38900%) and becomes alarmist noise. Cap
// the absolute change we'll display; beyond it, hide the comparison.
// Currency-agnostic — purely a sanity bound on the rendered number.
const PERCENT_DISPLAY_CAP = 999;

/**
 * Composable data hook for the home screen.
 *
 * Wraps 8 independent TanStack Query hooks and returns a flat typed
 * object. Each underlying query keeps its own cache key, staleTime, and
 * invalidation — so adding a new data source is:
 *   1. Call another hook at the top of this function.
 *   2. Add a field to the returned object.
 *   3. Add its data dep to the useMemo array.
 *
 * Why a wrapper instead of useQueries:
 *   - Existing per-key invalidation stays untouched.
 *   - The component that consumes this doesn't need to know how many
 *     queries exist or what their keys are.
 *   - No change to test surface — each underlying hook is testable on
 *     its own.
 */
export function useHomeData(
  selectedMonth: string,
  prevMonth: string,
  year: number,
  month: number,
  isCurrentMonth: boolean,
) {
  const recent = useRecentTransactions(RECENT_TRANSACTIONS_LIMIT);
  const monthTx = useMonthTransactions(
    selectedMonth,
    RECENT_TRANSACTIONS_LIMIT,
  );
  const summary = useMonthlySummary(selectedMonth);
  const prevSummary = useMonthlySummary(prevMonth);
  const subsTotal = useSubscriptionsTotal();
  const reimbursement = useReimbursementSummary();
  const totalBudget = useTotalMonthlyBudget();
  const insights = useMonthlyInsights(year, month);

  return useMemo(() => {
    const income = summary.data?.total_income ?? 0;
    const expenses = summary.data?.total_expenses ?? 0;
    const prevExpenses = prevSummary.data?.total_expenses ?? 0;
    const rawPct =
      prevExpenses > 0
        ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100)
        : null;
    const spendingChange =
      rawPct !== null
        ? Math.abs(rawPct) > PERCENT_DISPLAY_CAP
          ? null
          : rawPct
        : expenses > 0
          ? ("new" as const)
          : null;

    return {
      recentTransactions: recent.data ?? [],
      monthTransactions: monthTx.data ?? [],
      transactions: isCurrentMonth ? (recent.data ?? []) : (monthTx.data ?? []),
      transactionsLoading: isCurrentMonth
        ? recent.isLoading
        : monthTx.isLoading,

      income,
      expenses,
      prevExpenses,
      spendingChange,
      subsTotal: subsTotal.data ?? 0,
      reimbursementSummary: reimbursement.data,
      totalBudget: totalBudget.data ?? 0,
      insights: insights.data,
    };
  }, [
    recent.data,
    recent.isLoading,
    monthTx.data,
    monthTx.isLoading,
    summary.data,
    prevSummary.data,
    subsTotal.data,
    reimbursement.data,
    totalBudget.data,
    insights.data,
    isCurrentMonth,
  ]);
}

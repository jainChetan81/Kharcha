import { useMemo } from "react";
import {
  useBiggestTransaction,
  useCategoryBreakdown,
  useMonthlySummary,
  useTrackingStreak,
  useTransactionCount,
} from "@/hooks/use-transactions";

// Same display cap the home screen applies — guards against tiny prior-month
// totals (e.g. ₹100 → ₹39k = 38900%) that produce alarmist deltas. When
// exceeded, the wrap shows direction only ("↑ vs March") instead of a number.
const PERCENT_DISPLAY_CAP = 999;

// `"new"` = no prior data, current > 0. `"huge-up" | "huge-down"` = prior > 0
// but the % delta is too large to print; direction is still meaningful.
export type InsightsChange = number | "new" | "huge-up" | "huge-down" | null;

export function useInsightsData(
  selectedMonth: string,
  prevMonth: string,
  asOfDate?: string,
) {
  const summary = useMonthlySummary(selectedMonth);
  const prevSummary = useMonthlySummary(prevMonth);
  const breakdown = useCategoryBreakdown(selectedMonth);
  const biggest = useBiggestTransaction(selectedMonth);
  const txCount = useTransactionCount(selectedMonth);
  const streak = useTrackingStreak(asOfDate);

  return useMemo(() => {
    const expenses = summary.data?.total_expenses ?? 0;
    const income = summary.data?.total_income ?? 0;
    const prevExpenses = prevSummary.data?.total_expenses ?? 0;
    const rawPct =
      prevExpenses > 0
        ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100)
        : null;
    const change: InsightsChange =
      rawPct !== null
        ? Math.abs(rawPct) > PERCENT_DISPLAY_CAP
          ? rawPct > 0
            ? "huge-up"
            : "huge-down"
          : rawPct
        : expenses > 0
          ? "new"
          : null;

    const transactionCount = txCount.data ?? 0;
    return {
      expenses,
      income,
      prevExpenses,
      change,
      topCategory: breakdown.data?.[0] ?? null,
      biggestTransaction: biggest.data ?? null,
      transactionCount,
      streak: streak.data ?? 0,
      hasData: transactionCount > 0,
      isLoading: summary.isLoading || breakdown.isLoading || txCount.isLoading,
    };
  }, [
    summary.data,
    summary.isLoading,
    prevSummary.data,
    breakdown.data,
    breakdown.isLoading,
    biggest.data,
    txCount.data,
    txCount.isLoading,
    streak.data,
  ]);
}

export type InsightsData = ReturnType<typeof useInsightsData>;

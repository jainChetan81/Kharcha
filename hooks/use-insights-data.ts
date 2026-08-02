import { useMemo } from "react";
import {
  useBiggestTransaction,
  useCategoryBreakdown,
  useMonthlySummary,
  useTrackingStreak,
  useTransactionCount,
} from "@/hooks/use-transactions";
import {
  computeSpendingChange,
  type SpendingChange,
} from "@/lib/spending-change";

// `"new"` = no prior data, current > 0. `"huge-up" | "huge-down"` = prior > 0
// but the % delta is too large to print; direction is still meaningful.
export type InsightsChange = SpendingChange;

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
    const change: InsightsChange = computeSpendingChange(
      expenses,
      prevExpenses,
    );

    const transactionCount = txCount.data ?? 0;
    const error =
      summary.error ??
      breakdown.error ??
      txCount.error ??
      biggest.error ??
      null;
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
      error,
    };
  }, [
    summary.data,
    summary.isLoading,
    summary.error,
    prevSummary.data,
    breakdown.data,
    breakdown.isLoading,
    breakdown.error,
    biggest.data,
    biggest.error,
    txCount.data,
    txCount.isLoading,
    txCount.error,
    streak.data,
  ]);
}

export type InsightsData = ReturnType<typeof useInsightsData>;

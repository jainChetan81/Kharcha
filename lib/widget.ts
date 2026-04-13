import { format } from "date-fns";
import { Platform } from "react-native";
import { CONFIG_KEYS, MONTH_FORMAT } from "@/lib/constants";
import {
  getCategoryBreakdown,
  getMonthlyInsights,
  getMonthlySummary,
  getPreviousMonthSpendAtDay,
  getTodaySpend,
} from "@/lib/db";
import { getBudgets } from "@/lib/db/budgets";
import { getConfig } from "@/lib/db/config";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";

type WidgetData = {
  totalExpenses: number;
  currencySymbol: string;
  monthLabel: string;
  categories: Array<{ name: string; amount: number; percentage: number }>;
  projectedLow: number | null;
  projectedHigh: number | null;
  daysElapsed: number;
  daysInMonth: number;
  todaySpend: number;
  totalBudget: number | null;
  previousMonthSpendAtThisPoint: number | null;
  lastUpdated: string;
};

export async function syncWidgetData(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: (name: string) => {
        setWidgetData: (json: string) => void;
      };
    };
    const widgetModule = requireNativeModule("ReactNativeWidgetExtension");

    const now = new Date();
    const yearMonth = format(now, MONTH_FORMAT);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [summary, breakdown, insights, todaySpend, currencyCode, budgets] =
      await Promise.all([
        getMonthlySummary(yearMonth),
        getCategoryBreakdown(yearMonth),
        getMonthlyInsights(year, month),
        getTodaySpend(),
        getConfig(CONFIG_KEYS.CURRENCY),
        getBudgets(),
      ]);

    const prevSpend = await getPreviousMonthSpendAtDay(insights.daysElapsed);

    const code = (currencyCode ?? "INR") as CurrencyCode;
    const symbol = CURRENCIES[code]?.symbol ?? "₹";

    const payload: WidgetData = {
      totalExpenses: summary.total_expenses ?? 0,
      currencySymbol: symbol,
      monthLabel: format(now, "MMMM yyyy"),
      categories: breakdown.map((c) => ({
        name: c.category_name,
        amount: c.total,
        percentage: c.percentage,
      })),
      projectedLow: insights.projectedLow,
      projectedHigh: insights.projectedHigh,
      daysElapsed: insights.daysElapsed,
      daysInMonth: insights.daysInMonth,
      todaySpend,
      totalBudget:
        budgets.length > 0 && budgets.length >= breakdown.length
          ? budgets.reduce((sum, b) => sum + b.amount, 0)
          : null,
      previousMonthSpendAtThisPoint: prevSpend,
      lastUpdated: now.toISOString(),
    };

    widgetModule.setWidgetData(JSON.stringify(payload));
  } catch {
    // Widget sync is non-critical — never crash the app for this
  }
}

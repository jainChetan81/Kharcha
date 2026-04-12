import { format } from "date-fns";
import { Platform } from "react-native";
import { CONFIG_KEYS, MONTH_FORMAT } from "@/lib/constants";
import {
  getCategoryBreakdown,
  getMonthlyInsights,
  getMonthlySummary,
  getTodaySpend,
} from "@/lib/db";
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
  lastUpdated: string;
};

export async function syncWidgetData(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const { SharedGroupPreferences, reloadAllTimelines } =
      require("react-native-widget-extension") as {
        SharedGroupPreferences: {
          setItem: (key: string, value: string, group: string) => Promise<void>;
        };
        reloadAllTimelines: () => void;
      };

    const now = new Date();
    const yearMonth = format(now, MONTH_FORMAT);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [summary, breakdown, insights, todaySpend, currencyCode] =
      await Promise.all([
        getMonthlySummary(yearMonth),
        getCategoryBreakdown(yearMonth),
        getMonthlyInsights(year, month),
        getTodaySpend(),
        getConfig(CONFIG_KEYS.CURRENCY),
      ]);

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
      lastUpdated: now.toISOString(),
    };

    await SharedGroupPreferences.setItem(
      "widgetData",
      JSON.stringify(payload),
      "group.com.chetanjain.kharcha",
    );

    reloadAllTimelines();
  } catch {
    // Widget sync is non-critical — never crash the app for this
  }
}

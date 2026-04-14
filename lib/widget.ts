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

export async function buildWidgetPayload(): Promise<WidgetData> {
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

  return {
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
    lastUpdated: new Date().toISOString(),
  };
}

async function syncIOS(payload: WidgetData): Promise<void> {
  const { requireNativeModule } = require("expo-modules-core") as {
    requireNativeModule: (name: string) => {
      setWidgetData: (json: string) => void;
    };
  };
  const widgetModule = requireNativeModule("ReactNativeWidgetExtension");
  widgetModule.setWidgetData(JSON.stringify(payload));
}

async function syncAndroid(payload: WidgetData): Promise<void> {
  const { updateAndroidWidgets } = require("@/lib/android-widget-handler") as {
    updateAndroidWidgets: (data: typeof payload) => Promise<void>;
  };
  await updateAndroidWidgets(payload);
}

// Debounce widget rebuilds. syncWidgetData fires on app launch, every AppState
// foreground transition, and after every transaction mutation. Rapid fire
// (e.g. bulk gmail sync or the user toggling apps) would otherwise trigger 6
// DB queries + native bridge calls per call. Coalesce calls inside this window.
const DEBOUNCE_MS = 1500;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

async function runSync(): Promise<void> {
  try {
    const payload = await buildWidgetPayload();
    if (Platform.OS === "ios") {
      await syncIOS(payload);
    } else if (Platform.OS === "android") {
      await syncAndroid(payload);
    }
  } catch {
    // Widget sync is non-critical — never crash the app for this
  }
}

export function syncWidgetData(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return Promise.resolve();
  }
  if (pendingTimer) clearTimeout(pendingTimer);
  return new Promise<void>((resolve) => {
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      inFlight = runSync().finally(() => {
        inFlight = null;
      });
      inFlight.then(resolve);
    }, DEBOUNCE_MS);
  });
}

// Escape hatch for callers that need to flush immediately (e.g. unit tests or
// a manual "refresh widgets" action). Normal callers should use syncWidgetData.
export async function flushWidgetSync(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (inFlight) await inFlight;
  await runSync();
}

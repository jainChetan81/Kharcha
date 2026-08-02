import { format } from "date-fns";
import { Platform } from "react-native";
import { CONFIG_KEYS, MONTH_FORMAT } from "@/lib/constants";
import {
  getActiveTag,
  getCategoryBreakdown,
  getMonthlyInsights,
  getMonthlySummary,
  getPreviousMonthSpendAtDay,
  getTodaySpend,
  getTotalMonthlyBudget,
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
  totalBudget: number | null;
  previousMonthSpendAtThisPoint: number | null;
  /** Currently-active scope (tag with a window covering "now"), or null. */
  activeTagName: string | null;
  lastUpdated: string;
};

export async function buildWidgetPayload(): Promise<WidgetData> {
  const now = new Date();
  const yearMonth = format(now, MONTH_FORMAT);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    summary,
    breakdown,
    insights,
    todaySpend,
    currencyCode,
    totalBudget,
    activeTag,
  ] = await Promise.all([
    getMonthlySummary(yearMonth),
    getCategoryBreakdown(yearMonth),
    getMonthlyInsights(year, month),
    getTodaySpend(),
    getConfig(CONFIG_KEYS.CURRENCY),
    getTotalMonthlyBudget(),
    getActiveTag(),
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
    totalBudget: totalBudget > 0 ? totalBudget : null,
    previousMonthSpendAtThisPoint: prevSpend,
    activeTagName: activeTag?.name ?? null,
    lastUpdated: new Date().toISOString(),
  };
}

async function syncIOS(payload: WidgetData): Promise<void> {
  const { requireNativeModule } = require("expo") as {
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
let pendingResolvers: Array<() => void> = [];
// Serialize syncs so a slow earlier run's native write can't overwrite
// a fresher later read's output (last-write-wins on the bridge).
let runningSync: Promise<void> | null = null;

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

function fireDebouncedSync() {
  const resolvers = pendingResolvers;
  pendingResolvers = [];
  pendingTimer = null;
  const next = (runningSync ?? Promise.resolve()).then(runSync);
  runningSync = next;
  next.finally(() => {
    if (runningSync === next) runningSync = null;
    for (const resolve of resolvers) resolve();
  });
}

export function syncWidgetData(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    pendingResolvers.push(resolve);
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(fireDebouncedSync, DEBOUNCE_MS);
  });
}

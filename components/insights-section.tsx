import { format } from "date-fns";
import { router } from "expo-router";
import { ChevronRight, TrendingUp } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SCREENS, TRANSACTION_TYPE } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Insight {
  topCategoryChange: {
    categoryId: number | null;
    category: string;
    direction: "up" | "down";
    percent: number;
  } | null;
  projectedLow: number | null;
  projectedHigh: number | null;
  daysElapsed: number;
  daysInMonth: number;
}

interface InsightsSectionProps {
  insights: Insight | undefined;
  insightsLoading: boolean;
  expenses: number;
  totalBudget: number;
  fmt: (n: number) => string;
  selectedDate: Date;
}

export function InsightsSection({
  insights,
  insightsLoading,
  expenses,
  totalBudget,
  fmt,
  selectedDate,
}: InsightsSectionProps) {
  const selectedMonth = format(selectedDate, "yyyy-MM");

  if (insightsLoading) {
    return (
      <View className="mx-5 mb-4 mt-2 rounded-xl bg-card p-4">
        <View className="h-4 w-3/4 rounded bg-muted" />
        <View className="mt-2 h-4 w-2/3 rounded bg-muted" />
      </View>
    );
  }

  if (!insights?.topCategoryChange && insights?.projectedLow == null) {
    return null;
  }

  return (
    <View className="mx-5 mb-4 mt-2 gap-3">
      {insights?.topCategoryChange && (
        <Pressable
          onPress={() =>
            router.push(
              `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&category_id=${insights.topCategoryChange?.categoryId ?? "other"}&month=${selectedMonth}`,
            )
          }
          className="flex-row items-center gap-3 rounded-xl bg-card px-4 py-3"
        >
          <Icon
            as={TrendingUp}
            className={cn(
              insights.topCategoryChange.direction === "up"
                ? "text-negative"
                : "text-positive",
            )}
            size={16}
          />
          <Text className="flex-1 text-xs text-muted-foreground">
            <Text
              className={cn(
                "text-xs font-semibold",
                insights.topCategoryChange.direction === "up"
                  ? "text-negative"
                  : "text-positive",
              )}
            >
              {insights.topCategoryChange.percent}%{" "}
              {insights.topCategoryChange.direction === "up" ? "more" : "less"}
            </Text>{" "}
            on {insights.topCategoryChange.category} vs last month
          </Text>
          <Icon as={ChevronRight} className="text-muted-foreground" size={14} />
        </Pressable>
      )}
      {insights?.projectedLow != null && insights?.projectedHigh != null && (
        <View className="rounded-xl bg-card p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-medium text-muted-foreground">
              Projected spending
            </Text>
            <Text className="text-xs text-muted-foreground">
              {insights.daysInMonth - insights.daysElapsed} days left
            </Text>
          </View>
          <Text
            className={cn(
              "mt-2 text-base font-bold",
              totalBudget > 0 && insights.projectedHigh > totalBudget
                ? "text-negative"
                : "text-foreground",
            )}
          >
            {fmt(Math.round(insights.projectedLow))} –{" "}
            {fmt(Math.round(insights.projectedHigh))}
          </Text>
          <View className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <View
              className={cn(
                "h-full rounded-full",
                totalBudget > 0 && insights.projectedHigh > totalBudget
                  ? "bg-negative"
                  : "bg-primary",
              )}
              style={{
                width: `${Math.round((insights.daysElapsed / insights.daysInMonth) * 100)}%`,
              }}
            />
          </View>
          <View className="mt-1.5 flex-row items-center justify-between">
            <Text className="text-[10px] text-muted-foreground">
              {fmt(expenses)} spent
            </Text>
            {totalBudget > 0 && (
              <Text className="text-[10px] text-muted-foreground">
                {fmt(totalBudget)} budget
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

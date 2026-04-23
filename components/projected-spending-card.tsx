import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function ProjectedSpendingCard({
  projectedLow,
  projectedHigh,
  daysElapsed,
  daysInMonth,
  expenses,
  totalBudget,
  fmt,
}: {
  projectedLow: number;
  projectedHigh: number;
  daysElapsed: number;
  daysInMonth: number;
  expenses: number;
  totalBudget: number;
  fmt: (n: number) => string;
}) {
  const daysLeft = Math.max(daysInMonth - daysElapsed, 0);
  const overBudget = totalBudget > 0 && projectedHigh > totalBudget;
  const progressRatio =
    totalBudget > 0
      ? Math.min(expenses / totalBudget, 1)
      : Math.min(daysElapsed / daysInMonth, 1);

  return (
    <View className="rounded-xl bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-muted-foreground">
          Projected spending
        </Text>
        <Text className="text-xs text-muted-foreground">
          {daysLeft} days left
        </Text>
      </View>
      <Text
        className={cn(
          "mt-2 text-lg font-bold",
          overBudget ? "text-negative" : "text-foreground",
        )}
      >
        {fmt(Math.round(projectedLow))} – {fmt(Math.round(projectedHigh))}
      </Text>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <View
          className={cn(
            "h-full rounded-full",
            overBudget ? "bg-negative" : "bg-primary",
          )}
          style={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </View>
      <View className="mt-1.5 flex-row items-center justify-between">
        <Text className="text-[11px] text-muted-foreground">
          {fmt(expenses)} spent
        </Text>
        {totalBudget > 0 && (
          <Text className="text-[11px] text-muted-foreground">
            {fmt(totalBudget)} budget
          </Text>
        )}
      </View>
    </View>
  );
}

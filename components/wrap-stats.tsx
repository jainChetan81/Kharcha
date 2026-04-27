import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { InsightsData } from "@/hooks/use-insights-data";
import { cn } from "@/lib/utils";

type Props = {
  data: InsightsData;
  fmt: (n: number) => string;
  monthLabel: string;
  prevMonthLabel: string;
};

export function WrapStats({ data, fmt, monthLabel, prevMonthLabel }: Props) {
  const { change, expenses, income, transactionCount, streak } = data;
  const badge = renderBadge(change, prevMonthLabel);

  return (
    <View>
      <Text className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {monthLabel}
      </Text>
      <Text className="mt-2 text-center text-4xl font-extrabold text-foreground">
        {fmt(expenses)}
      </Text>
      <View className="mt-3 items-center">
        <View
          className={cn(
            "rounded-full px-3 py-1",
            badge.tone === "down" && "bg-positive/10",
            badge.tone === "up" && "bg-negative/10",
            badge.tone === "muted" && "bg-muted/20",
          )}
        >
          <Text
            className={cn(
              "text-xs font-medium",
              badge.tone === "down" && "text-positive",
              badge.tone === "up" && "text-negative",
              badge.tone === "muted" && "text-muted-foreground",
            )}
          >
            {badge.label}
          </Text>
        </View>
      </View>

      <View className="my-5 h-px bg-border" />

      <StatRow
        icon="📂"
        label="Top category"
        value={renderTopCategory(data, fmt)}
      />
      <StatRow
        icon="🛒"
        label="Biggest purchase"
        value={renderBiggest(data, fmt)}
      />
      <StatRow icon="💰" label="Income" value={fmt(income)} />
      <StatRow icon="📊" label="Transactions" value={`${transactionCount}`} />
      <StatRow
        icon="🔥"
        label="Tracking streak"
        value={streak === 1 ? "1 day" : `${streak} days`}
      />
    </View>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View className="mb-3 flex-row items-center">
      <Text className="mr-3 text-lg">{icon}</Text>
      <Text className="flex-1 text-sm text-muted-foreground">{label}</Text>
      <Text
        className="ml-2 text-sm font-semibold text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

type Badge = { label: string; tone: "down" | "up" | "muted" };

function renderBadge(
  change: InsightsData["change"],
  prevMonthLabel: string,
): Badge {
  if (change === null || change === "new") {
    return { label: "First month tracking", tone: "muted" };
  }
  if (change === "huge-up") {
    return { label: `↑ vs ${prevMonthLabel}`, tone: "up" };
  }
  if (change === "huge-down") {
    return { label: `↓ vs ${prevMonthLabel}`, tone: "down" };
  }
  if (change < 0) {
    return {
      label: `↓${Math.abs(change)}% vs ${prevMonthLabel}`,
      tone: "down",
    };
  }
  if (change > 0) {
    return { label: `↑${change}% vs ${prevMonthLabel}`, tone: "up" };
  }
  return { label: `Same as ${prevMonthLabel}`, tone: "muted" };
}

function renderTopCategory(data: InsightsData, fmt: (n: number) => string) {
  if (!data.topCategory) return "—";
  return `${data.topCategory.category_name} · ${fmt(data.topCategory.total)}`;
}

function renderBiggest(data: InsightsData, fmt: (n: number) => string) {
  const tx = data.biggestTransaction;
  if (!tx) return "—";
  const merchant = tx.merchant ?? "Unknown";
  return `${merchant} · ${fmt(tx.amount)}`;
}

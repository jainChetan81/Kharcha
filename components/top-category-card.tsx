import { router } from "expo-router";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import { Pressable } from "react-native";
import { ALERT_TONE_TEXT } from "@/components/ui/alert-banner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { TRANSACTION_TYPE } from "@/lib/constants";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { historyHref } from "@/lib/format";
import { cn } from "@/lib/utils";

type TopCategoryChange = {
  categoryId: number | null;
  category: string;
  direction: "up" | "down";
  percent: number;
};

export function TopCategoryCard({
  change,
  selectedMonth,
}: {
  change: TopCategoryChange;
  selectedMonth: string;
}) {
  const isUp = change.direction === "up";
  const tone = isUp ? "negative" : "positive";

  return (
    <Pressable
      onPress={() => {
        logEvent(FIREBASE_EVENTS.INSIGHT_CARD_TAPPED, { card: "top_category" });
        router.push(
          historyHref({
            type: TRANSACTION_TYPE.EXPENSE,
            categoryId: change.categoryId ?? "other",
            month: selectedMonth,
          }),
        );
      }}
      hitSlop={8}
      className="mt-2 flex-row items-center justify-center gap-1.5"
    >
      <Icon
        as={isUp ? TrendingUp : TrendingDown}
        className={cn("size-3.5", ALERT_TONE_TEXT[tone])}
      />
      <Text className="text-xs text-muted-foreground">
        <Text className={cn("text-xs font-semibold", ALERT_TONE_TEXT[tone])}>
          {change.percent}% {isUp ? "more" : "less"}
        </Text>{" "}
        on {change.category} vs last month
      </Text>
    </Pressable>
  );
}

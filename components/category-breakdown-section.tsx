import { format } from "date-fns";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { COLORS, SCREENS, TRANSACTION_TYPE } from "@/lib/constants";

interface CategoryBreakdown {
  category_id: number | null;
  category_name: string;
  total: number;
  percentage: number;
}

interface CategoryBreakdownSectionProps {
  categoryBreakdown: CategoryBreakdown[];
  budgets: Map<number, number>;
  fmt: (n: number) => string;
  selectedDate: Date;
  isCurrentMonth: boolean;
}

const BAR_BG_STYLE = { backgroundColor: COLORS.BAR_BG } as const;

export function CategoryBreakdownSection({
  categoryBreakdown,
  budgets,
  fmt,
  selectedDate,
  isCurrentMonth,
}: CategoryBreakdownSectionProps) {
  if (categoryBreakdown.length === 0) return null;

  return (
    <View className="px-5 pb-4 pt-2">
      <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        {isCurrentMonth ? "This Month" : format(selectedDate, "MMMM")}
      </Text>
      {categoryBreakdown.map((cat) => {
        const budget = cat.category_id
          ? budgets.get(cat.category_id)
          : undefined;
        const ratio = budget ? cat.total / budget : 0;
        const barColor = !budget
          ? COLORS.PRIMARY
          : ratio >= 1
            ? COLORS.DANGER
            : ratio >= 0.75
              ? COLORS.WARNING
              : COLORS.PRIMARY;
        const barWidth = budget ? Math.min(ratio * 100, 100) : cat.percentage;

        return (
          <Pressable
            key={cat.category_id ?? "other"}
            onPress={() =>
              router.push(
                `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&category_id=${cat.category_id ?? "other"}&month=${format(selectedDate, "yyyy-MM")}`,
              )
            }
            className="mb-3"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-base text-foreground">
                {cat.category_name}
              </Text>
              <View className="flex-row items-center gap-1">
                <Text className="text-sm text-muted-foreground">
                  {fmt(cat.total)}
                  {budget ? ` / ${fmt(budget)}` : ""}
                </Text>
                <Icon
                  as={ChevronRight}
                  className="size-4 text-muted-foreground"
                />
              </View>
            </View>
            <View className="mt-1.5 h-1 rounded-full" style={BAR_BG_STYLE}>
              <View
                className="h-1 rounded-full"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: barColor,
                }}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

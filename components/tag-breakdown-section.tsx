import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { COLORS, SCREENS, TRANSACTION_TYPE } from "@/lib/constants";

interface TagBreakdown {
  tag_id: number;
  tag_name: string;
  total: number;
  count: number;
  percentage: number;
}

interface TagBreakdownSectionProps {
  tagBreakdown: TagBreakdown[];
  fmt: (n: number) => string;
}

const BAR_BG_STYLE = { backgroundColor: COLORS.BAR_BG } as const;

export function TagBreakdownSection({
  tagBreakdown,
  fmt,
}: TagBreakdownSectionProps) {
  if (tagBreakdown.length === 0) return null;

  return (
    <View className="px-5 pb-4 pt-2">
      <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Top Tags
      </Text>
      {tagBreakdown.slice(0, 5).map((tag) => (
        <Pressable
          key={tag.tag_id}
          onPress={() =>
            router.push(
              `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&tag_id=${tag.tag_id}`,
            )
          }
          className="mb-3"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-foreground">#{tag.tag_name}</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-muted-foreground">
                {tag.count} tx
              </Text>
              <Text className="ml-2 text-sm text-muted-foreground">
                {fmt(tag.total)}
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
                width: `${tag.percentage}%`,
                backgroundColor: COLORS.PRIMARY,
              }}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

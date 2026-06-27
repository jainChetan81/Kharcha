import {
  differenceInHours,
  differenceInMinutes,
  format,
  parse,
} from "date-fns";
import { router } from "expo-router";
import { Layers } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useActiveTag, useEndScheduleNow } from "@/hooks/use-tags";
import { DATE_FORMAT, DATE_TIME_FORMAT, tagScreen } from "@/lib/constants";

/**
 * Format the gap between "now" and `endAt` as a short, friendly label:
 * "ends in 45 min" / "ends in 2 hours" / "ends tomorrow" / "ends in 5 days" /
 * "ends Mar 12". The cutoffs aim for whichever phrasing reads most naturally
 * at that distance.
 */
function formatEndsIn(endAt: Date): string {
  const now = new Date();
  const minutes = differenceInMinutes(endAt, now);
  if (minutes <= 0) return "ending now";
  if (minutes < 60) return `ends in ${minutes} min`;
  const hours = differenceInHours(endAt, now);
  if (hours < 24) return `ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ends tomorrow";
  if (days < 7) return `ends in ${days} days`;
  return `ends ${format(endAt, DATE_FORMAT)}`;
}

export function HomeContextCards() {
  const { data: activeTag } = useActiveTag();
  const endNowMutation = useEndScheduleNow();

  if (!activeTag) return null;

  const endAt = activeTag.end_date
    ? parse(activeTag.end_date, DATE_TIME_FORMAT, new Date())
    : null;
  const endsLabel = endAt ? formatEndsIn(endAt) : null;

  return (
    <View className="mt-2 gap-2 px-5">
      <View className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
        <View className="flex-row items-center">
          <Icon as={Layers} className="mr-3 size-4 text-primary-text" />
          <Pressable
            onPress={() => router.push(tagScreen(activeTag.id))}
            className="flex-1"
            hitSlop={4}
          >
            <Text className="text-sm font-semibold text-foreground">
              #{activeTag.name} scope active
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {endsLabel
                ? `${endsLabel} · auto-tagging new transactions`
                : "auto-tagging new transactions"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!activeTag.start_date) return;
              endNowMutation.mutate({
                id: activeTag.id,
                name: activeTag.name,
                startAt: activeTag.start_date,
              });
            }}
            disabled={endNowMutation.isPending}
            className="ml-2 rounded-lg border border-primary/50 bg-primary/20 px-2.5 py-1.5"
            hitSlop={6}
          >
            <Text className="text-[11px] font-semibold text-primary-text">
              End now
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

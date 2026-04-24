import {
  Award,
  CalendarDays,
  ChevronDown,
  type LucideIcon,
  Repeat2,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { StackedBar } from "@/components/ui/stacked-bar";
import { Text } from "@/components/ui/text";
import type { FilteredInsights } from "@/hooks/use-transactions";
import { CATEGORY_PALETTE } from "@/lib/constants";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { cn } from "@/lib/utils";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HistoryInsightsStrip({
  insights,
  fmt,
  onSeeFullInsights,
  defaultExpanded = false,
}: {
  insights: FilteredInsights;
  fmt: (n: number) => string;
  onSeeFullInsights?: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotation = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  useEffect(() => {
    if (defaultExpanded) logEvent(FIREBASE_EVENTS.HISTORY_INSIGHTS_EXPANDED);
  }, [defaultExpanded]);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.spring(rotation, {
      toValue: expanded ? 0 : 1,
      useNativeDriver: true,
      friction: 7,
      tension: 70,
    }).start();
    if (!expanded) logEvent(FIREBASE_EVENTS.HISTORY_INSIGHTS_EXPANDED);
    setExpanded(!expanded);
  }

  const chevronRotation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  if (insights.count === 0) return null;

  const netPositive = insights.net >= 0;

  return (
    <View className="mx-5 mb-3 overflow-hidden rounded-xl bg-card">
      <Pressable onPress={toggle} className="flex-row items-center px-4 py-3">
        <Text className="flex-1 text-xs text-muted-foreground">
          {insights.count} tx
          {insights.spent > 0 && (
            <>
              {"  ·  "}
              <Text className="text-xs font-semibold text-negative">
                {fmt(insights.spent)} spent
              </Text>
            </>
          )}
          {insights.income > 0 && (
            <>
              {"  ·  "}
              <Text className="text-xs font-semibold text-positive">
                {fmt(insights.income)} income
              </Text>
            </>
          )}
          {insights.transferred > 0 && (
            <>
              {"  ·  "}
              <Text className="text-xs font-semibold text-muted-foreground">
                {fmt(insights.transferred)} transferred
              </Text>
            </>
          )}
        </Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Icon
            as={ChevronDown}
            className="size-4 text-muted-foreground"
            size={16}
          />
        </Animated.View>
      </Pressable>

      {expanded && (
        <View className="border-t border-border px-4 pb-4 pt-3">
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Net
              </Text>
              <Text
                className={cn(
                  "mt-0.5 text-2xl font-bold",
                  netPositive ? "text-positive" : "text-negative",
                )}
              >
                {netPositive ? "+" : "−"}
                {fmt(Math.abs(insights.net))}
              </Text>
            </View>
            {insights.daySpan > 1 && (
              <View className="items-end">
                <Text className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Days
                </Text>
                <Text className="mt-0.5 text-base font-semibold text-foreground">
                  {insights.daySpan}
                </Text>
              </View>
            )}
          </View>

          {insights.topCategories.length > 0 && (
            <View className="mt-4">
              <Text className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Where it went
              </Text>
              <StackedBar
                segments={insights.topCategories.map((cat, i) => ({
                  value: cat.total,
                  color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                }))}
                total={insights.spent}
              />
              <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1">
                {insights.topCategories.map((cat, i) => (
                  <View
                    key={cat.name}
                    className="flex-row items-center gap-1.5"
                  >
                    <View
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor:
                          CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                      }}
                    />
                    <Text className="text-[11px] text-muted-foreground">
                      {cat.name} · {fmt(cat.total)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className="mt-4 flex-row gap-2">
            <FactCard
              icon={Award}
              label="Biggest"
              primary={
                insights.biggestTransaction
                  ? fmt(insights.biggestTransaction.amount)
                  : "—"
              }
              primaryMono
              secondary={insights.biggestTransaction?.label ?? ""}
            />
            <FactCard
              icon={Repeat2}
              label="Frequent"
              primary={insights.mostFrequentMerchant?.merchant ?? "—"}
              secondary={
                insights.mostFrequentMerchant
                  ? `${insights.mostFrequentMerchant.count}×`
                  : ""
              }
            />
            <FactCard
              icon={CalendarDays}
              label="Avg/day"
              primary={insights.avgPerDay > 0 ? fmt(insights.avgPerDay) : "—"}
              primaryMono
              secondary=""
            />
          </View>

          {onSeeFullInsights && (
            <Pressable
              onPress={onSeeFullInsights}
              className="mt-4 items-center py-2"
            >
              <Text className="text-sm font-medium text-primary">
                See full insights →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function FactCard({
  icon,
  label,
  primary,
  primaryMono,
  secondary,
}: {
  icon: LucideIcon;
  label: string;
  primary: string;
  primaryMono?: boolean;
  secondary: string;
}) {
  return (
    <View className="flex-1 rounded-xl bg-background p-3">
      <View className="mb-2.5 flex-row items-center gap-1.5">
        <Icon as={icon} className="text-muted-foreground" size={14} />
        <Text className="text-[11px] font-medium text-muted-foreground">
          {label}
        </Text>
      </View>
      <Text
        className={cn(
          "text-base font-bold text-foreground",
          primaryMono && "font-mono",
        )}
        numberOfLines={1}
      >
        {primary}
      </Text>
      {secondary !== "" && (
        <Text
          className="mt-1 text-[11px] text-muted-foreground"
          numberOfLines={1}
        >
          {secondary}
        </Text>
      )}
    </View>
  );
}

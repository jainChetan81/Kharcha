import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { TransactionRow } from "@/lib/db";
import { formatINR, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.7;

export function TransactionItem({
  item,
  showTime = false,
  onPress,
  onSwipeDelete,
}: {
  item: TransactionRow;
  showTime?: boolean;
  onPress?: (id: number) => void;
  onSwipeDelete?: (item: TransactionRow) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const itemHeight = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 10,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(itemHeight, {
              toValue: 0,
              duration: 200,
              useNativeDriver: false,
            }),
          ]).start(() => {
            onSwipeDelete?.(item);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 10,
          }).start();
        }
      },
    }),
  ).current;

  const isIncome = item.type === "income";
  const subtitle = isIncome
    ? (item.category_name ?? "uncategorized")
    : `${item.category_name ?? "uncategorized"}${item.source_name ? ` · ${item.source_name}` : ""}`;

  const content = (
    <Pressable
      onPress={() => onPress?.(item.id)}
      className="flex-row items-center rounded-2xl border border-border bg-card p-4"
      disabled={!onPress}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
        <Text className="text-sm font-semibold text-muted-foreground">
          {(item.merchant ?? item.category_name ?? "?")[0].toUpperCase()}
        </Text>
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-foreground">
          {item.merchant || item.category_name || item.type}
        </Text>
        <Text className="mt-0.5 text-xs capitalize text-muted-foreground">
          {subtitle}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={cn(
            "text-sm font-bold",
            isIncome ? "text-positive" : "text-negative",
          )}
        >
          {isIncome ? "+" : "-"}
          {formatINR(item.amount)}
        </Text>
        {showTime && (
          <Text className="mt-0.5 text-[10px] text-muted-foreground">
            {format(parseDate(item.date), "hh:mm a")}
          </Text>
        )}
      </View>
      {onPress && (
        <Icon as={ChevronRight} className="ml-2 size-4 text-muted-foreground" />
      )}
    </Pressable>
  );

  if (!onSwipeDelete) {
    return <View className="mb-2">{content}</View>;
  }

  return (
    <Animated.View
      className="mb-2 overflow-hidden"
      style={{
        maxHeight: itemHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 200],
        }),
        opacity: itemHeight,
      }}
    >
      <View className="absolute inset-0 items-end justify-center rounded-2xl bg-negative px-6">
        <Text className="text-sm font-semibold text-white">Delete</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {content}
      </Animated.View>
    </Animated.View>
  );
}

export function DateHeader({ label }: { label: string }) {
  return (
    <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </Text>
  );
}

import { format } from "date-fns";
import * as Haptics from "expo-haptics";
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
import { useCurrency } from "@/hooks/use-currency";
import {
  OTHER_CATEGORY_LABEL,
  PARSED_BY,
  SOURCE_TYPE,
  TIME_FORMAT,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import type { TransactionRow } from "@/lib/db";
import { parseDate, smartCapitalize } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

const TAG_VARIANTS = {
  muted: { bg: "bg-muted-foreground", text: "text-white" },
  gmail: { bg: "bg-blue-700", text: "text-white" },
  primary: { bg: "bg-primary", text: "text-primary-foreground" },
  ai: { bg: "bg-indigo-600", text: "text-white" },
} as const;

function Tag({
  label,
  variant,
}: {
  label: string;
  variant: keyof typeof TAG_VARIANTS;
}) {
  const { bg, text } = TAG_VARIANTS[variant];
  return (
    <View className={cn("rounded-md px-1.5 py-0.5", bg)}>
      <Text className={cn("text-[10px] font-medium", text)}>{label}</Text>
    </View>
  );
}

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
  const { format: fmt } = useCurrency();
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 10,
        }).start();
      },
    }),
  ).current;

  const isIncome = item.type === TRANSACTION_TYPE.INCOME;
  const isTransfer = item.type === TRANSACTION_TYPE.TRANSFER;
  const categoryLabel = smartCapitalize(
    item.category_name ?? OTHER_CATEGORY_LABEL,
  );
  const subtitle = isTransfer
    ? `${item.source_name ?? "?"} → ${item.destination_source_name ?? "?"}`
    : isIncome
      ? categoryLabel
      : `${categoryLabel}${item.source_name ? ` · ${smartCapitalize(item.source_name)}` : ""}`;

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
        <View className="flex-row items-center gap-1">
          <Text
            numberOfLines={1}
            className="shrink text-sm font-semibold text-foreground"
          >
            {item.merchant || item.category_name || OTHER_CATEGORY_LABEL}
          </Text>
          {isTransfer && <Tag label="TRANSFER" variant="muted" />}
          {item.source_type === SOURCE_TYPE.SYNCED && (
            <Tag label="GMAIL" variant="gmail" />
          )}
          {item.parsed_by === PARSED_BY.GEMINI && (
            <Tag label="AI" variant="ai" />
          )}
          {item.source_type === SOURCE_TYPE.RECURRING && (
            <Tag label="SUB" variant="primary" />
          )}
        </View>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-xs text-muted-foreground"
        >
          {subtitle}
        </Text>
      </View>
      <View className="shrink-0 items-end">
        <Text
          numberOfLines={1}
          className={cn(
            "text-sm font-bold",
            isTransfer
              ? "text-muted-foreground"
              : isIncome
                ? "text-positive"
                : "text-negative",
          )}
        >
          {isTransfer ? "" : isIncome ? "+" : "-"}
          {fmt(item.amount)}
        </Text>
        {showTime && (
          <Text className="mt-0.5 text-[10px] text-muted-foreground">
            {format(parseDate(item.date), TIME_FORMAT)}
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

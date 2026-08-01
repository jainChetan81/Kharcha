import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { ChevronRight } from "lucide-react-native";
import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { TagChip } from "@/components/ui/tag-chip";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  ANIMATION_DURATION_MS,
  COLORS,
  INVESTMENT_KIND,
  OTHER_CATEGORY_LABEL,
  PARSED_BY,
  REIMBURSEMENT_STATUS,
  SOURCE_TYPE,
  TAG_DISPLAY_LIMIT,
  TIME_FORMAT,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import type { TransactionRow } from "@/lib/db";
import { parseDate, smartCapitalize } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCREEN_WIDTH = Dimensions.get("window").width;
// iOS Mail-style commit threshold. Below this, the row reads as "preview"
// (dim red, snaps back). Crossing it flips to bright red, signaling
// "release to delete".
const SWIPE_COMMIT_THRESHOLD = SCREEN_WIDTH * 0.7;
// Desaturated counterpart to COLORS.DANGER for the pre-commit swipe state.
// Hand-picked to read as "muted red" rather than "transparent red"; an
// rgba alpha approach also dims the white "Delete" label, which we don't
// want.
const DIM_DANGER = "#7a2e2e";

const TAG_VARIANTS = {
  muted: { bg: "bg-muted-foreground", text: "text-white" },
  gmail: { bg: "bg-blue-700", text: "text-white" },
  mini: { bg: "bg-purple-700", text: "text-white" },
  primary: { bg: "bg-primary", text: "text-primary-foreground" },
  ai: { bg: "bg-indigo-600", text: "text-white" },
  warning: { bg: "bg-amber-600", text: "text-white" },
  positive: { bg: "bg-positive", text: "text-white" },
} as const;

// One row's amount can present as five distinct "flavors". Mapping each to
// its `{ color, sign }` once removes the nested ternary in the JSX and means
// adding a future flavor (e.g. a new investment kind) is a single entry.
const AMOUNT_FLAVOR = {
  income: { color: "text-positive", sign: "+" },
  expense: { color: "text-negative-text", sign: "-" },
  transfer: { color: "text-muted-foreground", sign: "" },
  "investment-inflow": { color: "text-positive", sign: "+" },
  "investment-outflow": { color: "text-muted-foreground", sign: "-" },
} as const;

type AmountFlavor = keyof typeof AMOUNT_FLAVOR;

function getAmountFlavor(item: TransactionRow): AmountFlavor {
  if (item.type === TRANSACTION_TYPE.TRANSFER) return "transfer";
  if (item.type === TRANSACTION_TYPE.INVESTMENT) {
    const inflow =
      item.investment_kind === INVESTMENT_KIND.SELL ||
      item.investment_kind === INVESTMENT_KIND.DIVIDEND ||
      item.investment_kind === INVESTMENT_KIND.INTEREST;
    return inflow ? "investment-inflow" : "investment-outflow";
  }
  if (item.type === TRANSACTION_TYPE.INCOME) return "income";
  return "expense";
}

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

export const TransactionItem = memo(function TransactionItem({
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
  const inCommitZone = useRef(false);

  // FlashList recycles row components, so a row that just animated to a
  // collapsed state can come back rendering a different item.id with stale
  // 0-height / off-screen translateX — which shows up as a phantom gap at
  // the top of the list. Reset on every item.id change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id is the trigger — we intentionally re-run when the slot recycles to a different row even though the body doesn't reference it.
  useEffect(() => {
    translateX.setValue(0);
    itemHeight.setValue(1);
    inCommitZone.current = false;
  }, [item.id, translateX, itemHeight]);

  // Tick haptic each time the gesture crosses the commit boundary so the
  // user feels "release to delete" without watching the color change.
  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      const inZone = value <= -SWIPE_COMMIT_THRESHOLD;
      if (inZone !== inCommitZone.current) {
        inCommitZone.current = inZone;
        Haptics.selectionAsync();
      }
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  // The PanResponder below is created once (useRef) so its handlers close
  // over whatever `item` was in scope on this fiber's first render. FlashList
  // recycles this component across different rows without remounting it (see
  // the item.id effect above), so a later swipe could otherwise still delete
  // the ORIGINAL item. Keep a ref current so the release handler always reads
  // the row actually on screen.
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);

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
        if (gesture.dx < -SWIPE_COMMIT_THRESHOLD) {
          // Capture the row's current item NOW, synchronously at commit
          // time — not inside the animation callback below. The callback
          // fires ~ANIMATION_DURATION_MS later; if a background sync
          // updates the list data during that window, FlashList can
          // reassign this row's pool slot to a different transaction and
          // itemRef.current would have already moved on by the time the
          // callback reads it, deleting the wrong row.
          const committedItem = itemRef.current;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: ANIMATION_DURATION_MS,
              useNativeDriver: true,
            }),
            Animated.timing(itemHeight, {
              toValue: 0,
              duration: ANIMATION_DURATION_MS,
              useNativeDriver: false,
            }),
          ]).start(() => {
            inCommitZone.current = false;
            onSwipeDelete?.(committedItem);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 10,
          }).start();
          inCommitZone.current = false;
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 10,
        }).start();
        inCommitZone.current = false;
      },
    }),
  ).current;

  const isIncome = item.type === TRANSACTION_TYPE.INCOME;
  const isTransfer = item.type === TRANSACTION_TYPE.TRANSFER;
  const isInvestment = item.type === TRANSACTION_TYPE.INVESTMENT;
  const { color: amountColor, sign: amountSign } =
    AMOUNT_FLAVOR[getAmountFlavor(item)];
  const categoryLabel = smartCapitalize(
    item.category_name ?? OTHER_CATEGORY_LABEL,
  );
  // Investment rows have no merchant or category — the holding is the
  // identity. Title falls back to holding_name; subtitle leads with the kind
  // (Buy / Sell / Dividend / Interest), then units (when present), then the
  // funding source.
  const investmentSubtitleParts = isInvestment
    ? [
        smartCapitalize(item.investment_kind ?? ""),
        item.units ? `${item.units.toFixed(4)} units` : null,
        item.source_name ? smartCapitalize(item.source_name) : null,
      ].filter((p): p is string => Boolean(p))
    : [];

  const subtitle = isTransfer
    ? `${item.source_name ?? "?"} → ${item.destination_source_name ?? "?"}`
    : isInvestment
      ? investmentSubtitleParts.join(" · ")
      : isIncome
        ? categoryLabel
        : `${categoryLabel}${item.source_name ? ` · ${smartCapitalize(item.source_name)}` : ""}`;

  const titleText = isInvestment
    ? (item.holding_name ?? OTHER_CATEGORY_LABEL)
    : item.merchant || item.category_name || OTHER_CATEGORY_LABEL;
  const avatarLetter = (
    isInvestment
      ? item.holding_name || "?"
      : item.merchant || item.category_name || "?"
  )[0].toUpperCase();

  const content = (
    <Pressable
      onPress={() => onPress?.(item.id)}
      className="flex-row items-center rounded-2xl border border-border bg-card p-4"
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityActions={
        onSwipeDelete ? [{ name: "delete", label: "Delete" }] : undefined
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "delete") onSwipeDelete?.(item);
      }}
    >
      <View className="size-10 items-center justify-center rounded-xl bg-muted">
        <Text className="text-sm font-semibold text-muted-foreground">
          {avatarLetter}
        </Text>
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center gap-1">
          <Text
            numberOfLines={1}
            className="shrink text-sm font-semibold text-foreground"
          >
            {titleText}
          </Text>
          {isTransfer && <Tag label="TRANSFER" variant="muted" />}
          {isInvestment && item.source_type !== SOURCE_TYPE.RECURRING && (
            <Tag label="INVEST" variant="primary" />
          )}
          {item.source_type === SOURCE_TYPE.SYNCED && (
            <Tag label="GMAIL" variant="gmail" />
          )}
          {item.source_type === SOURCE_TYPE.MINI_SYNCED && (
            <Tag label="MINI" variant="mini" />
          )}
          {item.parsed_by === PARSED_BY.GEMINI && (
            <Tag label="AI" variant="ai" />
          )}
          {item.source_type === SOURCE_TYPE.RECURRING && (
            <Tag label={isInvestment ? "SIP" : "SUB"} variant="primary" />
          )}
          {item.reimbursement_status === REIMBURSEMENT_STATUS.PENDING && (
            <Tag label="REIMBURSE" variant="warning" />
          )}
          {item.reimbursement_status === REIMBURSEMENT_STATUS.REIMBURSED && (
            <Tag label="REIMBURSED" variant="positive" />
          )}
        </View>
        <Text
          numberOfLines={1}
          className="mt-0.5 text-xs text-muted-foreground"
        >
          {subtitle}
        </Text>
        {item.tags && item.tags.length > 0 && (
          <View className="mt-1 flex-row flex-wrap gap-1">
            {item.tags.slice(0, TAG_DISPLAY_LIMIT).map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                emoji={tag.emoji}
              />
            ))}
            {item.tags.length > 3 && (
              <Text className="text-[10px] text-muted-foreground">
                +{item.tags.length - 3}
              </Text>
            )}
          </View>
        )}
      </View>
      <View className="shrink-0 items-end">
        <Text
          numberOfLines={1}
          className={cn("text-sm font-bold", amountColor)}
        >
          {amountSign}
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

  // iOS Mail-style two-stage red: a desaturated dim shade below the commit
  // threshold, a snap to the bright theme red above. Interpolating the bg
  // color (instead of opacity) keeps the white "Delete" label fully readable
  // in both states. The +1 step at the threshold makes the flip read as a
  // hard snap rather than a fade.
  const bgColor = translateX.interpolate({
    inputRange: [
      -SCREEN_WIDTH,
      -SWIPE_COMMIT_THRESHOLD,
      -SWIPE_COMMIT_THRESHOLD + 1,
      0,
    ],
    outputRange: [COLORS.DANGER, COLORS.DANGER, DIM_DANGER, DIM_DANGER],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      className="overflow-hidden"
      style={{
        maxHeight: itemHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 200],
        }),
        // Animate the gap-to-next-row alongside height so a freshly-deleted
        // row leaves no stranded margin while the data refresh is in flight.
        marginBottom: itemHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 8],
        }),
        opacity: itemHeight,
      }}
    >
      <Animated.View
        className="absolute inset-0 items-end justify-center rounded-2xl px-6"
        style={{ backgroundColor: bgColor }}
      >
        <Text className="text-sm font-semibold text-white">Delete</Text>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {content}
      </Animated.View>
    </Animated.View>
  );
});

export function DateHeader({ label }: { label: string }) {
  return (
    <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </Text>
  );
}

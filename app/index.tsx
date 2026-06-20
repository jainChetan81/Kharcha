import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  House,
  Mail,
  Plus,
  Settings,
  User,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { HomeContextCards } from "@/components/home-context-cards";
import { ProjectedSpendingCard } from "@/components/projected-spending-card";
import { SpendingHeatmap } from "@/components/spending-heatmap";
import { SpendingPanel } from "@/components/spending-panel";
import { TopCategoryCard } from "@/components/top-category-card";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { TransactionSkeleton } from "@/components/transaction-skeleton";
import { ALERT_TONE_TEXT } from "@/components/ui/alert-banner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/hooks/use-config";
import { useCurrency } from "@/hooks/use-currency";
import { useHomeData } from "@/hooks/use-home-data";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useCategoryBreakdown } from "@/hooks/use-transactions";
import {
  CATEGORY_PALETTE,
  COLORS,
  DATE_ISO_FORMAT,
  editScreen,
  LABELS,
  MONTH_FORMAT,
  OTHER_CATEGORY_LABEL,
  RECENT_TRANSACTIONS_LIMIT,
  SCREENS,
  SHADOWS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import {
  buildListData,
  getInitials,
  historyHref,
  smartCapitalize,
} from "@/lib/format";
import { cn, getRefreshControlProps, isIOS } from "@/lib/utils";

// FAB sits half-out of the bar's top edge. Rendered absolutely (not via
// transform) so the lifted half still receives taps on Android, where
// transform-based hit testing has historically been unreliable.
const FAB_SIZE = 52;
const FAB_HALF = FAB_SIZE / 2;

const TOP_CATEGORIES_ON_RING = 5;

type DonutSlice = {
  categoryId: number | "other" | null;
  label: string;
  amount: number;
  pct: number;
};

function CategoryDonut({
  selectedMonth,
  income,
  expenses,
  fmt,
}: {
  selectedMonth: string;
  income: number;
  expenses: number;
  fmt: (n: number) => string;
}) {
  const { data: categories = [] } = useCategoryBreakdown(selectedMonth);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [prevMonth, setPrevMonth] = useState(selectedMonth);
  if (prevMonth !== selectedMonth) {
    setPrevMonth(selectedMonth);
    setFocusedIndex(null);
  }

  const hasIncome = income > 0;
  const hasExpenses = expenses > 0;
  const hasAny = hasIncome || hasExpenses;
  const net = income - expenses;
  const overspent = net < 0;

  const top = categories.slice(0, TOP_CATEGORIES_ON_RING);
  const topTotal = top.reduce((s, c) => s + c.total, 0);
  const categoriesTotal = categories.reduce((s, c) => s + c.total, 0);
  const otherTotal = Math.max(categoriesTotal - topTotal, 0);
  const interactive = hasExpenses && top.length > 0;

  const slices: DonutSlice[] = interactive
    ? [
        ...top.map(
          (c): DonutSlice => ({
            categoryId: c.category_id,
            label: smartCapitalize(c.category_name),
            amount: c.total,
            pct: categoriesTotal > 0 ? (c.total / categoriesTotal) * 100 : 0,
          }),
        ),
        ...(otherTotal > 0
          ? [
              {
                categoryId: "other" as const,
                label: OTHER_CATEGORY_LABEL,
                amount: otherTotal,
                pct:
                  categoriesTotal > 0
                    ? (otherTotal / categoriesTotal) * 100
                    : 0,
              },
            ]
          : []),
      ]
    : [];

  const pieData = interactive
    ? slices.map((s, i) => ({
        value: s.amount,
        color:
          s.categoryId === "other"
            ? COLORS.BAR_BG
            : CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      }))
    : [{ value: 100, color: `${COLORS.POSITIVE}b3` }];

  if (!hasAny) {
    return (
      <View
        className="h-[180px] items-center justify-center"
        accessibilityRole="summary"
        accessibilityLabel={LABELS.NO_DATA}
      >
        <Text className="text-xs text-muted-foreground">{LABELS.NO_DATA}</Text>
      </View>
    );
  }

  const focused =
    focusedIndex != null && focusedIndex < slices.length
      ? slices[focusedIndex]
      : null;

  const handleSlicePress = (_item: unknown, index: number) => {
    if (!interactive) return;
    const slice = slices[index];
    if (!slice) return;
    if (focusedIndex === index) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(
        historyHref({
          type: TRANSACTION_TYPE.EXPENSE,
          categoryId: slice.categoryId,
          month: selectedMonth,
        }),
      );
      return;
    }
    Haptics.selectionAsync();
    setFocusedIndex(index);
  };

  return (
    <View className="items-center">
      <PieChart
        data={pieData}
        donut
        radius={90}
        innerRadius={62}
        innerCircleColor={COLORS.BACKGROUND}
        strokeColor={COLORS.BACKGROUND}
        strokeWidth={2}
        focusOnPress={interactive}
        toggleFocusOnPress={false}
        focusedPieIndex={focusedIndex ?? undefined}
        onPress={handleSlicePress}
        centerLabelComponent={() =>
          focused ? (
            <View className="items-center justify-center px-3">
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-foreground"
              >
                {focused.label}
              </Text>
              <Text className="mt-0.5 text-base font-bold text-foreground">
                {fmt(focused.amount)}
              </Text>
              <Text className="mt-0.5 text-[10px] text-muted-foreground">
                {focused.pct.toFixed(0)}% · tap again
              </Text>
            </View>
          ) : (
            <View className="items-center justify-center">
              <Text
                className={cn(
                  "text-xl font-bold",
                  overspent ? "text-negative" : "text-foreground",
                )}
              >
                {fmt(Math.abs(net))}
              </Text>
              <Text className="mt-0.5 text-[11px] text-muted-foreground">
                {overspent ? LABELS.SPENT : LABELS.AVAILABLE}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

// Three discrete states for the month-over-month spending banner: first
// month (no comparison), spending up vs last month, spending down. Each
// pairs a className with its rendered copy — keeping color and text in
// lockstep, instead of two parallel ternaries that can drift.
function getSpendingChangeFlavor(
  value: number | "new" | null,
): { color: string; text: string } | null {
  if (value === null) return null;
  if (value === "new")
    return { color: "text-muted-foreground", text: "First month tracking" };
  if (value > 0)
    return { color: "text-negative", text: `↑ ${value}% vs last month` };
  return {
    color: "text-positive",
    text: `↓ ${Math.abs(value)}% vs last month`,
  };
}

export default function HomeScreen() {
  const { bottom } = useSafeAreaInsets();
  const { format: fmt } = useCurrency();
  const { userName } = useConfig();
  const { refreshing, onRefresh, gmailConnected } = useSyncRefresh();
  const showSyncButton = gmailConnected;

  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const isCurrentMonth = isSameMonth(selectedDate, now);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  function navigateMonth(next: Date) {
    Haptics.selectionAsync();
    Animated.timing(contentOpacity, {
      toValue: 0.4,
      duration: 80,
      useNativeDriver: true,
    }).start(() => {
      setSelectedDate(next);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }

  const selectedMonth = format(selectedDate, MONTH_FORMAT);
  const prevMonth = format(subMonths(selectedDate, 1), MONTH_FORMAT);

  const {
    transactions,
    transactionsLoading: recentActivityLoading,
    income,
    expenses,
    spendingChange,
    subsTotal,
    reimbursementSummary,
    totalBudget,
    insights,
  } = useHomeData(
    selectedMonth,
    prevMonth,
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
    isCurrentMonth,
  );
  const listData = useMemo(() => buildListData(transactions), [transactions]);
  const spendingChangeFlavor = getSpendingChangeFlavor(spendingChange);

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        style={{ opacity: contentOpacity }}
        refreshControl={
          <RefreshControl {...getRefreshControlProps(refreshing, onRefresh)} />
        }
      >
        <View className={cn("px-6 pb-4", isIOS ? "pt-[60px]" : "pt-12")}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">
              Hello, {userName}
            </Text>
            <View className="flex-row items-center gap-2">
              {showSyncButton && (
                <Pressable
                  onPress={onRefresh}
                  disabled={refreshing}
                  className="size-10 items-center justify-center rounded-full border border-border bg-card"
                >
                  {refreshing ? (
                    <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                  ) : (
                    <Icon as={Mail} className="size-4 text-muted-foreground" />
                  )}
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push(SCREENS.PROFILE)}
                className="size-10 items-center justify-center rounded-full bg-primary"
              >
                <Text className="text-sm font-bold text-primary-foreground">
                  {getInitials(userName)}
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between">
            <Pressable
              onPress={() => navigateMonth(subMonths(selectedDate, 1))}
              hitSlop={12}
              className="rounded-full p-2"
            >
              <Icon as={ChevronLeft} className="size-6 text-muted-foreground" />
            </Pressable>
            <Text className="text-base font-medium text-muted-foreground">
              {format(selectedDate, "MMMM yyyy")}
            </Text>
            <Pressable
              onPress={() =>
                !isCurrentMonth && navigateMonth(addMonths(selectedDate, 1))
              }
              hitSlop={12}
              className="rounded-full p-2"
            >
              <Icon
                as={ChevronRight}
                className={cn(
                  "size-6",
                  isCurrentMonth
                    ? "text-muted-foreground/20"
                    : "text-muted-foreground",
                )}
              />
            </Pressable>
          </View>

          <View className="mt-3">
            <ComponentErrorBoundary name="home.category-donut">
              <CategoryDonut
                selectedMonth={selectedMonth}
                income={income}
                expenses={expenses}
                fmt={fmt}
              />
            </ComponentErrorBoundary>
          </View>

          {(spendingChangeFlavor || subsTotal > 0) && (
            <View className="mt-3 flex-row items-center justify-center gap-2">
              {spendingChangeFlavor && (
                <Text
                  className={cn(
                    "text-xs font-medium",
                    spendingChangeFlavor.color,
                  )}
                >
                  {spendingChangeFlavor.text}
                </Text>
              )}
              {spendingChangeFlavor && subsTotal > 0 && (
                <Text className="text-xs text-muted-foreground">·</Text>
              )}
              {subsTotal > 0 && (
                <Pressable
                  onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
                  hitSlop={8}
                >
                  <Text className="text-xs text-muted-foreground">
                    ↻ {fmt(subsTotal)} in subs
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {insights?.topCategoryChange && (
            <TopCategoryCard
              change={insights.topCategoryChange}
              selectedMonth={selectedMonth}
            />
          )}

          {reimbursementSummary && reimbursementSummary.pending_count > 0 && (
            <Pressable
              onPress={() => router.push(SCREENS.REIMBURSEMENTS)}
              hitSlop={8}
              className="mt-2 flex-row items-center justify-center gap-1"
            >
              <Text className={cn("text-xs", ALERT_TONE_TEXT.warn)}>
                {fmt(reimbursementSummary.pending_total)} in{" "}
                {reimbursementSummary.pending_count} pending reimbursement
                {reimbursementSummary.pending_count === 1 ? "" : "s"}
              </Text>
              <Icon
                as={ChevronRight}
                className={cn("size-3", ALERT_TONE_TEXT.warn)}
              />
            </Pressable>
          )}

          <View className="mt-4 gap-3">
            {insights?.projectedLow != null &&
              insights?.projectedHigh != null && (
                <ProjectedSpendingCard
                  projectedLow={insights.projectedLow}
                  projectedHigh={insights.projectedHigh}
                  daysElapsed={insights.daysElapsed}
                  daysInMonth={insights.daysInMonth}
                  expenses={expenses}
                  totalBudget={totalBudget}
                  fmt={fmt}
                />
              )}
          </View>
        </View>

        <ComponentErrorBoundary name="home.context-cards">
          <HomeContextCards />
        </ComponentErrorBoundary>

        <View className="px-5 pt-2">
          <Pressable
            onPress={() => router.push(SCREENS.INSIGHTS)}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {format(selectedDate, "MMMM yyyy")}
            </Text>
            <ComponentErrorBoundary name="home.heatmap">
              <SpendingHeatmap
                yearMonth={selectedMonth}
                today={format(now, DATE_ISO_FORMAT)}
              />
            </ComponentErrorBoundary>
          </Pressable>
        </View>

        <ComponentErrorBoundary name="home.spending-panel">
          <SpendingPanel selectedMonth={selectedMonth} fmt={fmt} />
        </ComponentErrorBoundary>

        <ComponentErrorBoundary name="home.transaction-list">
          <View className="px-5 pt-4">
            <Text className="mb-3 text-lg font-semibold text-foreground">
              Recent activity
            </Text>
            {recentActivityLoading ? (
              <TransactionSkeleton count={RECENT_TRANSACTIONS_LIMIT} />
            ) : (
              listData.map((item) =>
                item.type === "header" ? (
                  <DateHeader key={`h-${item.label}`} label={item.label} />
                ) : (
                  <TransactionItem
                    key={`t-${item.data.id}`}
                    item={item.data}
                    onPress={(id) => router.push(editScreen(id))}
                  />
                ),
              )
            )}
          </View>
        </ComponentErrorBoundary>
      </Animated.ScrollView>

      <View
        className="border-t border-border bg-card pt-1.5"
        style={{ paddingBottom: isIOS ? 12 : Math.max(bottom, 24) }}
      >
        <View className="flex-row items-center justify-around">
          <View className="items-center gap-1">
            <Icon as={House} className="size-5 text-primary" />
            <Text className="text-xs font-semibold text-primary">Home</Text>
          </View>
          <Pressable
            onPress={() => router.push(SCREENS.HISTORY)}
            className="items-center gap-1"
          >
            <Icon as={Clock} className="size-5 text-muted-foreground" />
            <Text className="text-xs font-medium text-muted-foreground">
              History
            </Text>
          </Pressable>
          {/* Layout placeholder — keeps the 5-item `justify-around` spacing
              exactly the same as before. The actual + button is rendered
              absolutely below so the lifted half doesn't lose its tap area
              on Android (transform-based hit-testing has known edge cases). */}
          <View className="size-[52px]" />
          <Pressable
            onPress={() => router.push(SCREENS.CONFIG)}
            className="items-center gap-1"
          >
            <Icon as={Settings} className="size-5 text-muted-foreground" />
            <Text className="text-xs font-medium text-muted-foreground">
              Config
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(SCREENS.PROFILE)}
            className="items-center gap-1"
          >
            <Icon as={User} className="size-5 text-muted-foreground" />
            <Text className="text-xs font-medium text-muted-foreground">
              Profile
            </Text>
          </Pressable>
        </View>
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: -FAB_HALF,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(SCREENS.ADD);
            }}
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.92 : 1 }],
            })}
          >
            <View
              className="items-center justify-center rounded-full bg-primary"
              style={[{ height: FAB_SIZE, width: FAB_SIZE }, SHADOWS.FAB]}
            >
              <Icon as={Plus} className="size-6 text-primary-foreground" />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

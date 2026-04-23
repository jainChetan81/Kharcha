import { addMonths, format, isSameMonth, subMonths } from "date-fns";
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
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { ProjectedSpendingCard } from "@/components/projected-spending-card";
import { SpendingPanel } from "@/components/spending-panel";
import { TopCategoryCard } from "@/components/top-category-card";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { ALERT_TONE_TEXT, AlertBanner } from "@/components/ui/alert-banner";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useConfig } from "@/hooks/use-config";
import { useCurrency } from "@/hooks/use-currency";
import { useGmailSyncActive } from "@/hooks/use-feature-flags";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useSubscriptionsTotal } from "@/hooks/use-subscriptions";
import {
  useMonthlyInsights,
  useMonthlySummary,
  useMonthTransactions,
  useRecentTransactions,
  useReimbursementSummary,
  useTotalMonthlyBudget,
} from "@/hooks/use-transactions";
import {
  COLORS,
  editScreen,
  LABELS,
  MONTH_FORMAT,
  SCREENS,
  SHADOWS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { buildListData, getInitials, historyHref } from "@/lib/format";
import { cn, getRefreshControlProps, isIOS } from "@/lib/utils";

const FAB_STYLE = { marginTop: -44, marginBottom: 8 } as const;
const RECENT_LIMIT = 5;

function SpendingRing({
  income,
  expenses,
  fmt,
}: {
  income: number;
  expenses: number;
  fmt: (n: number) => string;
}) {
  const hasIncome = income > 0;
  const hasExpenses = expenses > 0;
  const hasAny = hasIncome || hasExpenses;
  const net = income - expenses;
  const overspent = net < 0;

  const pieData = !hasAny
    ? [{ value: 100, color: COLORS.BAR_BG }]
    : !hasIncome
      ? [{ value: 100, color: COLORS.DANGER }]
      : !hasExpenses
        ? [{ value: 100, color: COLORS.POSITIVE }]
        : [
            { value: income, color: COLORS.POSITIVE },
            { value: expenses, color: COLORS.DANGER },
          ];

  return (
    <View className="items-center">
      <PieChart
        data={pieData}
        donut
        radius={76}
        innerRadius={63}
        innerCircleColor={COLORS.BACKGROUND}
        centerLabelComponent={() => (
          <View className="items-center justify-center">
            {hasAny ? (
              <>
                <Text
                  className={cn(
                    "text-xl font-bold",
                    overspent ? "text-negative" : "text-foreground",
                  )}
                >
                  {fmt(Math.abs(net))}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {overspent ? LABELS.SPENT : LABELS.AVAILABLE}
                </Text>
              </>
            ) : (
              <Text className="text-xs text-muted-foreground">
                {LABELS.NO_DATA}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { bottom } = useSafeAreaInsets();
  const { format: fmt } = useCurrency();
  const { userName } = useConfig();
  const { refreshing, onRefresh, gmailConnected } = useSyncRefresh();
  const gmailSyncActive = useGmailSyncActive();
  const showSyncButton = gmailSyncActive && gmailConnected;

  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const isCurrentMonth = isSameMonth(selectedDate, now);

  const selectedMonth = format(selectedDate, MONTH_FORMAT);
  const prevMonth = format(subMonths(selectedDate, 1), MONTH_FORMAT);

  const { data: recentTransactions = [] } = useRecentTransactions(RECENT_LIMIT);
  const { data: monthTransactions = [] } = useMonthTransactions(
    selectedMonth,
    RECENT_LIMIT,
  );
  const { data: summary } = useMonthlySummary(selectedMonth);
  const { data: prevSummary } = useMonthlySummary(prevMonth);
  const { data: subsTotal = 0 } = useSubscriptionsTotal();
  const { data: reimbursementSummary } = useReimbursementSummary();
  const { data: totalBudget = 0 } = useTotalMonthlyBudget();
  const { data: insights } = useMonthlyInsights(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
  );

  const income = summary?.total_income ?? 0;
  const expenses = summary?.total_expenses ?? 0;
  const prevExpenses = prevSummary?.total_expenses ?? 0;
  const spendingChange =
    prevExpenses > 0
      ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100)
      : expenses > 0
        ? "new"
        : null;
  const transactions = isCurrentMonth ? recentTransactions : monthTransactions;
  const listData = buildListData(transactions);

  const historyForMonth = historyHref({ month: selectedMonth });

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
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
                  className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
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
                className="h-10 w-10 items-center justify-center rounded-full bg-primary"
              >
                <Text className="text-sm font-bold text-primary-foreground">
                  {getInitials(userName)}
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between">
            <Pressable
              onPress={() => setSelectedDate(subMonths(selectedDate, 1))}
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
                !isCurrentMonth && setSelectedDate(addMonths(selectedDate, 1))
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
            <ComponentErrorBoundary name="home.spending-ring">
              <SpendingRing income={income} expenses={expenses} fmt={fmt} />
            </ComponentErrorBoundary>
          </View>

          <View className="mt-3 flex-row gap-3">
            <Pressable
              onPress={() =>
                router.push(
                  historyHref({
                    type: TRANSACTION_TYPE.INCOME,
                    month: selectedMonth,
                  }),
                )
              }
              className="flex-1 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <View>
                <Text className="text-xs text-muted-foreground">Income</Text>
                <Text className="mt-0.5 text-base font-bold text-positive">
                  {fmt(income)}
                </Text>
              </View>
              <Icon
                as={ChevronRight}
                className="size-4 text-muted-foreground"
              />
            </Pressable>
            <Pressable
              onPress={() =>
                router.push(
                  historyHref({
                    type: TRANSACTION_TYPE.EXPENSE,
                    month: selectedMonth,
                  }),
                )
              }
              className="flex-1 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <View>
                <Text className="text-xs text-muted-foreground">Spent</Text>
                <Text className="mt-0.5 text-base font-bold text-negative">
                  {fmt(expenses)}
                </Text>
              </View>
              <Icon
                as={ChevronRight}
                className="size-4 text-muted-foreground"
              />
            </Pressable>
          </View>

          {spendingChange !== null && (
            <Text
              className={cn(
                "mt-3 text-center text-xs font-medium",
                spendingChange === "new"
                  ? "text-muted-foreground"
                  : spendingChange > 0
                    ? "text-negative"
                    : "text-positive",
              )}
            >
              {spendingChange === "new"
                ? "First month tracking"
                : `${spendingChange > 0 ? "↑" : "↓"} ${Math.abs(spendingChange)}% vs last month`}
            </Text>
          )}

          {subsTotal > 0 && (
            <Pressable
              onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
              className="mt-3"
            >
              <Text className="text-center text-xs text-muted-foreground">
                ↻ {fmt(subsTotal)} in subscriptions this month
              </Text>
            </Pressable>
          )}

          <View className="mt-4 gap-3">
            {reimbursementSummary && reimbursementSummary.pending_count > 0 && (
              <AlertBanner
                tone="warn"
                onPress={() => router.push(SCREENS.REIMBURSEMENTS)}
              >
                <Text
                  className={cn("text-sm font-medium", ALERT_TONE_TEXT.warn)}
                >
                  {fmt(reimbursementSummary.pending_total)} in{" "}
                  {reimbursementSummary.pending_count} pending reimbursement
                  {reimbursementSummary.pending_count === 1 ? "" : "s"}
                </Text>
              </AlertBanner>
            )}

            {insights?.topCategoryChange && (
              <TopCategoryCard
                change={insights.topCategoryChange}
                selectedMonth={selectedMonth}
              />
            )}

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

        <ComponentErrorBoundary name="home.spending-panel">
          <SpendingPanel selectedMonth={selectedMonth} fmt={fmt} />
        </ComponentErrorBoundary>

        <ComponentErrorBoundary name="home.transaction-list">
          <View className="px-5 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">
                Recent activity
              </Text>
              <Pressable onPress={() => router.push(historyForMonth)}>
                <Text className="text-sm font-medium text-primary">
                  View all →
                </Text>
              </Pressable>
            </View>
            {listData.map((item) =>
              item.type === "header" ? (
                <DateHeader key={`h-${item.label}`} label={item.label} />
              ) : (
                <TransactionItem
                  key={`t-${item.data.id}`}
                  item={item.data}
                  onPress={(id) => router.push(editScreen(id))}
                />
              ),
            )}
          </View>
        </ComponentErrorBoundary>
      </ScrollView>

      <View
        className="border-t border-border bg-card pt-2.5"
        style={{ paddingBottom: Math.max(bottom, 24) }}
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
          <Pressable onPress={() => router.push(SCREENS.ADD)} style={FAB_STYLE}>
            <View
              className="h-[52px] w-[52px] items-center justify-center rounded-full bg-primary"
              style={SHADOWS.FAB}
            >
              <Icon as={Plus} className="size-6 text-primary-foreground" />
            </View>
          </Pressable>
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
      </View>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

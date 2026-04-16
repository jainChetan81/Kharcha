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
import { CategoryBreakdownSection } from "@/components/category-breakdown-section";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { InsightsSection } from "@/components/insights-section";
import { TagBreakdownSection } from "@/components/tag-breakdown-section";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useBudgets } from "@/hooks/use-budgets";
import { useConfig } from "@/hooks/use-config";
import { useCurrency } from "@/hooks/use-currency";
import { useGmailSyncEnabled } from "@/hooks/use-feature-flags";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useSubscriptionsTotal } from "@/hooks/use-subscriptions";
import { useTagBreakdown } from "@/hooks/use-tags";
import {
  useCategoryBreakdown,
  useMonthlyInsights,
  useMonthlySummary,
  useMonthTransactions,
  useRecentTransactions,
  useReimbursementSummary,
} from "@/hooks/use-transactions";
import {
  COLORS,
  editScreen,
  LABELS,
  MONTH_FORMAT,
  SCREENS,
  TOP_BREAKDOWN_LIMIT,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { buildListData, getInitials } from "@/lib/format";
import { cn, getRefreshControlProps, isIOS } from "@/lib/utils";

const FAB_STYLE = { marginTop: -44, marginBottom: 8 } as const;

const FAB_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.4,
  shadowRadius: 12,
  elevation: 10,
} as const;

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
  const overspent = expenses > income;

  const spentPercent = hasIncome ? Math.min((expenses / income) * 100, 100) : 0;

  const pieData = hasIncome
    ? [
        {
          value: overspent ? 0 : 100 - spentPercent,
          color: COLORS.PRIMARY,
        },
        {
          value: overspent ? 100 : spentPercent,
          color: overspent ? COLORS.DANGER : COLORS.BAR_BG,
        },
      ]
    : hasExpenses
      ? [{ value: 100, color: COLORS.DANGER }]
      : [{ value: 100, color: COLORS.BAR_BG }];

  const centerAmount = hasIncome ? income - expenses : expenses;
  const centerLabel = hasIncome ? LABELS.AVAILABLE : LABELS.SPENT;

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
            {hasIncome || hasExpenses ? (
              <>
                <Text
                  className={cn(
                    "text-xl font-bold",
                    !hasIncome || overspent
                      ? "text-negative"
                      : "text-foreground",
                  )}
                >
                  {fmt(Math.abs(centerAmount))}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {centerLabel}
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
  const gmailSyncEnabled = useGmailSyncEnabled();
  const showSyncButton = gmailSyncEnabled && gmailConnected;

  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const isCurrentMonth = isSameMonth(selectedDate, now);

  const selectedMonth = format(selectedDate, MONTH_FORMAT);
  const prevMonth = format(subMonths(selectedDate, 1), MONTH_FORMAT);

  const { data: recentTransactions = [] } = useRecentTransactions(10);
  const { data: monthTransactions = [] } = useMonthTransactions(
    selectedMonth,
    10,
  );
  const { data: summary } = useMonthlySummary(selectedMonth);
  const { data: prevSummary } = useMonthlySummary(prevMonth);
  const { data: categoryBreakdown = [] } = useCategoryBreakdown(selectedMonth);
  const { data: tagBreakdown = [] } = useTagBreakdown(selectedMonth);
  const { data: budgetsList = [] } = useBudgets();
  const { data: subsTotal = 0 } = useSubscriptionsTotal();
  const { data: reimbursementSummary } = useReimbursementSummary();
  const { data: insights, isLoading: insightsLoading } = useMonthlyInsights(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + 1,
  );
  const budgetMap = new Map(budgetsList.map((b) => [b.category_id, b.amount]));
  const totalBudget = budgetsList.reduce((sum, b) => sum + b.amount, 0);

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
                  `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.INCOME}&month=${selectedMonth}`,
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
                  `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&month=${selectedMonth}`,
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

          {reimbursementSummary && reimbursementSummary.pending_count > 0 && (
            <Pressable
              onPress={() => router.push(SCREENS.REIMBURSEMENTS)}
              className="mt-3 flex-row items-center justify-between rounded-xl border border-amber-600/40 bg-amber-600/10 px-4 py-2.5"
            >
              <Text className="text-xs font-medium text-amber-500">
                {fmt(reimbursementSummary.pending_total)} in{" "}
                {reimbursementSummary.pending_count} pending reimbursement
                {reimbursementSummary.pending_count === 1 ? "" : "s"}
              </Text>
              <Icon as={ChevronRight} className="size-4 text-amber-500" />
            </Pressable>
          )}
        </View>

        <ComponentErrorBoundary name="home.tag-breakdown">
          <TagBreakdownSection
            tagBreakdown={tagBreakdown.slice(0, TOP_BREAKDOWN_LIMIT)}
            fmt={fmt}
          />
        </ComponentErrorBoundary>

        <ComponentErrorBoundary name="home.category-breakdown">
          <CategoryBreakdownSection
            categoryBreakdown={categoryBreakdown}
            budgets={budgetMap}
            fmt={fmt}
            selectedDate={selectedDate}
            isCurrentMonth={isCurrentMonth}
          />
        </ComponentErrorBoundary>

        <ComponentErrorBoundary name="home.insights">
          <InsightsSection
            insights={insights}
            insightsLoading={insightsLoading}
            expenses={expenses}
            totalBudget={totalBudget}
            fmt={fmt}
            selectedDate={selectedDate}
          />
        </ComponentErrorBoundary>

        <ComponentErrorBoundary name="home.transaction-list">
          <View className="px-5 pt-2">
            <Text className="mb-3 text-sm font-semibold text-muted-foreground">
              {isCurrentMonth ? "Recent Transactions" : "Transactions"}
            </Text>
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
              style={FAB_SHADOW}
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

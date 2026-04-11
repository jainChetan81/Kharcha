import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import { router } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  House,
  Plus,
  Settings,
  TrendingUp,
  User,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useBudgets } from "@/hooks/use-budgets";
import { useConfig } from "@/hooks/use-config";
import { useCurrency } from "@/hooks/use-currency";
import { useRefresh } from "@/hooks/use-refresh";
import { useSubscriptionsTotal } from "@/hooks/use-subscriptions";
import {
  useCategoryBreakdown,
  useMonthlyInsights,
  useMonthlySummary,
  useMonthTransactions,
  useRecentTransactions,
} from "@/hooks/use-transactions";
import {
  COLORS,
  editScreen,
  LABELS,
  MONTH_FORMAT,
  SCREENS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { buildListData } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

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
  const { format: fmt } = useCurrency();
  const { userName } = useConfig();
  const { refreshing, onRefresh } = useRefresh();

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
  const { data: budgetsList = [] } = useBudgets();
  const { data: subsTotal = 0 } = useSubscriptionsTotal();
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
      : null;
  const transactions = isCurrentMonth ? recentTransactions : monthTransactions;
  const listData = buildListData(transactions);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.PRIMARY}
            progressViewOffset={40}
          />
        }
      >
        <View className={cn("px-6 pb-4", isIOS ? "pt-[60px]" : "pt-12")}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">
              Hello, {userName}
            </Text>
            <Pressable
              onPress={() => router.push(SCREENS.PROFILE)}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary"
            >
              <Text className="text-sm font-bold text-primary-foreground">
                {userName
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </Text>
            </Pressable>
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
                spendingChange > 0 ? "text-negative" : "text-positive",
              )}
            >
              {spendingChange > 0 ? "↑" : "↓"} {Math.abs(spendingChange)}% vs
              last month
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
        </View>

        {categoryBreakdown.length > 0 && (
          <ComponentErrorBoundary name="home.category-breakdown">
            <View className="px-5 pb-4 pt-2">
              <Text className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                {isCurrentMonth ? "This Month" : format(selectedDate, "MMMM")}
              </Text>
              {categoryBreakdown.map((cat) => {
                const budget = cat.category_id
                  ? budgetMap.get(cat.category_id)
                  : undefined;
                const ratio = budget ? cat.total / budget : 0;
                const barColor = !budget
                  ? COLORS.PRIMARY
                  : ratio >= 1
                    ? COLORS.DANGER
                    : ratio >= 0.75
                      ? COLORS.WARNING
                      : COLORS.PRIMARY;
                const barWidth = budget
                  ? Math.min(ratio * 100, 100)
                  : cat.percentage;

                return (
                  <Pressable
                    key={cat.category_id ?? "other"}
                    onPress={() =>
                      router.push(
                        `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&category_id=${cat.category_id ?? "other"}&month=${selectedMonth}`,
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
                    <View
                      className="mt-1.5 h-1 rounded-full"
                      style={{ backgroundColor: COLORS.BAR_BG }}
                    >
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
          </ComponentErrorBoundary>
        )}

        <ComponentErrorBoundary name="home.insights">
          {insightsLoading ? (
            <View className="mx-5 mb-4 mt-2 rounded-xl bg-card p-4">
              <View className="h-4 w-3/4 rounded bg-muted" />
              <View className="mt-2 h-4 w-2/3 rounded bg-muted" />
            </View>
          ) : insights?.topCategoryChange ||
            insights?.projectedSpend != null ? (
            <View className="mx-5 mb-4 mt-2 flex-row items-start gap-3 rounded-xl bg-card p-4">
              <Icon
                as={TrendingUp}
                className="mt-0.5 text-muted-foreground"
                size={16}
              />
              <View className="flex-1">
                {insights?.topCategoryChange && (
                  <Pressable
                    onPress={() =>
                      router.push(
                        `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&category_id=${insights.topCategoryChange?.categoryId ?? "other"}&month=${selectedMonth}`,
                      )
                    }
                  >
                    <Text className="text-xs text-muted-foreground">
                      {insights.topCategoryChange.direction === "up"
                        ? "↑"
                        : "↓"}{" "}
                      <Text
                        className={cn(
                          "text-xs font-semibold",
                          insights.topCategoryChange.direction === "up"
                            ? "text-negative"
                            : "text-positive",
                        )}
                      >
                        {insights.topCategoryChange.percent}%{" "}
                        {insights.topCategoryChange.direction === "up"
                          ? "more"
                          : "less"}
                      </Text>{" "}
                      on {insights.topCategoryChange.category} vs last month
                    </Text>
                  </Pressable>
                )}
                {insights?.projectedSpend != null && (
                  <Text
                    className={cn(
                      "text-xs",
                      insights.topCategoryChange && "mt-2",
                      totalBudget > 0
                        ? insights.projectedSpend > totalBudget
                          ? "text-negative"
                          : "text-positive"
                        : "text-muted-foreground",
                    )}
                  >
                    projected {fmt(Math.round(insights.projectedSpend))} this
                    month
                  </Text>
                )}
              </View>
            </View>
          ) : null}
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
        className={cn(
          "border-t border-border bg-card pt-2.5",
          isIOS ? "pb-7" : "pb-3.5",
        )}
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
          <Pressable
            onPress={() => router.push(SCREENS.ADD)}
            style={{ marginTop: -44, marginBottom: 8 }}
          >
            <View
              className="h-[52px] w-[52px] items-center justify-center rounded-full bg-primary"
              style={{
                elevation: 8,
                shadowColor: COLORS.PRIMARY,
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
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

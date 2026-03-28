import { format, subMonths } from "date-fns";
import { router } from "expo-router";
import {
  ChevronRight,
  Clock,
  House,
  Plus,
  Settings,
  User,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { ScreenError } from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useBudgets } from "@/hooks/use-budgets";
import { useCurrency } from "@/hooks/use-currency";
import { useSettings } from "@/hooks/use-settings";
import {
  useCategoryBreakdown,
  useMonthlySummary,
  useRecentTransactions,
} from "@/hooks/use-transactions";
import { COLORS, editScreen, SCREENS, TRANSACTION_TYPE } from "@/lib/constants";
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
  const balance = income - expenses;
  const hasIncome = income > 0;
  const overspent = expenses > income;

  const spentPercent = hasIncome ? Math.min((expenses / income) * 100, 100) : 0;

  const pieData = hasIncome
    ? [
        {
          value: overspent ? 0 : 100 - spentPercent,
          color: "#7c3aed",
        },
        {
          value: overspent ? 100 : spentPercent,
          color: overspent ? "#ef4444" : "#2a2a2a",
        },
      ]
    : [{ value: 100, color: "#2a2a2a" }];

  return (
    <View className="items-center">
      <PieChart
        data={pieData}
        donut
        radius={76}
        innerRadius={63}
        innerCircleColor="#0a0a0a"
        centerLabelComponent={() => (
          <View className="items-center justify-center">
            {hasIncome ? (
              <>
                <Text
                  className={cn(
                    "text-xl font-bold",
                    overspent ? "text-negative" : "text-foreground",
                  )}
                >
                  {fmt(balance)}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  available
                </Text>
              </>
            ) : (
              <Text className="text-xs text-muted-foreground">
                no income added
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
  const { userName } = useSettings();

  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const prevMonth = format(subMonths(now, 1), "yyyy-MM");

  const { data: transactions = [] } = useRecentTransactions(10);
  const { data: summary } = useMonthlySummary(currentMonth);
  const { data: prevSummary } = useMonthlySummary(prevMonth);
  const { data: categoryBreakdown = [] } = useCategoryBreakdown(currentMonth);
  const { data: budgetsList = [] } = useBudgets();
  const budgetMap = new Map(budgetsList.map((b) => [b.category_id, b.amount]));

  const income = summary?.total_income ?? 0;
  const expenses = summary?.total_expenses ?? 0;
  const prevExpenses = prevSummary?.total_expenses ?? 0;
  const spendingChange =
    prevExpenses > 0
      ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100)
      : null;
  const listData = buildListData(transactions);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View className={cn("px-6 pb-4", isIOS ? "pt-[60px]" : "pt-12")}>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-foreground">
                Hello, {userName}
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground">
                {format(new Date(), "MMMM yyyy")}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(SCREENS.PROFILE)}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary"
            >
              <Text className="text-sm font-bold text-primary-foreground">
                {userName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </Text>
            </Pressable>
          </View>

          {/* Spending Ring */}
          <View className="mt-3">
            <SpendingRing income={income} expenses={expenses} fmt={fmt} />
          </View>

          {/* Income / Spent row */}
          <View className="mt-3 flex-row gap-3">
            <Pressable
              onPress={() =>
                router.push(
                  `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.INCOME}`,
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
                  `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}`,
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

          {/* Month vs last month */}
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
        </View>

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <View className="px-5 pb-4 pt-2">
            <Text className="mb-3 text-sm font-semibold uppercase text-[#888888]">
              This Month
            </Text>
            {categoryBreakdown.map((cat) => {
              const budget = budgetMap.get(cat.category_id);
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
                  key={cat.category_id}
                  onPress={() =>
                    router.push(
                      `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}&category_id=${cat.category_id}`,
                    )
                  }
                  className="mb-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base capitalize text-[#f0f0f0]">
                      {cat.category_name}
                    </Text>
                    <Text className="text-sm text-[#888888]">
                      {fmt(cat.total)}
                      {budget ? ` / ${fmt(budget)}` : ""}
                    </Text>
                  </View>
                  <View className="mt-1.5 h-1 rounded-full bg-[#2a2a2a]">
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
        )}

        {/* Recent Transactions */}
        <View className="px-5 pt-2">
          <Text className="mb-3 text-sm font-semibold text-muted-foreground">
            Recent Transactions
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
      </ScrollView>

      {/* Bottom Nav */}
      <View
        className={cn(
          "border-t border-border bg-card pt-2.5",
          isIOS ? "pb-7" : "pb-3.5",
        )}
      >
        <View className="flex-row items-center justify-around">
          <View className="items-center gap-1">
            <Icon as={House} className="size-5 text-primary" />
            <Text className="text-[11px] font-semibold text-primary">Home</Text>
          </View>
          <Pressable
            onPress={() => router.push(SCREENS.HISTORY)}
            className="items-center gap-1"
          >
            <Icon as={Clock} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
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
                shadowColor: "#7c3aed",
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Icon as={Plus} className="size-6 text-primary-foreground" />
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push(SCREENS.SETTINGS)}
            className="items-center gap-1"
          >
            <Icon as={Settings} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
              Settings
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(SCREENS.PROFILE)}
            className="items-center gap-1"
          >
            <Icon as={User} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
              Profile
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

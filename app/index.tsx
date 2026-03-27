import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { router } from "expo-router";
import {
  ChevronRight,
  Clock,
  House,
  Plus,
  Settings,
  User,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { ScreenError } from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  editScreen,
  QUERY_KEYS,
  SCREENS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { getMonthlySummary, getRecentTransactions } from "@/lib/db";
import { buildListData, formatINR, type ListItem } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

function SpendingRing({
  income,
  expenses,
}: {
  income: number;
  expenses: number;
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
        radius={100}
        innerRadius={84}
        innerCircleColor="#0a0a0a"
        centerLabelComponent={() => (
          <View className="items-center justify-center">
            {hasIncome ? (
              <>
                <Text
                  className={cn(
                    "text-2xl font-bold",
                    overspent ? "text-negative" : "text-foreground",
                  )}
                >
                  {formatINR(balance)}
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
  const currentMonth = format(new Date(), "yyyy-MM");

  const { data: transactions = [] } = useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS],
    queryFn: () => getRecentTransactions(10),
  });

  const { data: summary } = useQuery({
    queryKey: [QUERY_KEYS.MONTHLY_SUMMARY, currentMonth],
    queryFn: () => getMonthlySummary(currentMonth),
  });

  const income = summary?.total_income ?? 0;
  const expenses = summary?.total_expenses ?? 0;
  const listData = buildListData(transactions);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn("bg-background px-6 pb-6", isIOS ? "pt-[60px]" : "pt-12")}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-bold text-foreground">
              Hello, Chetan
            </Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              {format(new Date(), "MMMM yyyy")}
            </Text>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Text className="text-sm font-bold text-primary-foreground">
              CJ
            </Text>
          </View>
        </View>

        {/* Spending Ring */}
        <View className="mt-5">
          <SpendingRing income={income} expenses={expenses} />
        </View>

        {/* Income / Spent row */}
        <View className="mt-4 flex-row gap-3">
          <Pressable
            onPress={() =>
              router.push(
                `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.INCOME}`,
              )
            }
            className="flex-1 flex-row items-center justify-between rounded-2xl border border-border bg-card p-4"
          >
            <View>
              <Text className="text-xs text-muted-foreground">Income</Text>
              <Text className="mt-1 text-lg font-bold text-positive">
                {formatINR(income)}
              </Text>
            </View>
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push(
                `${SCREENS.HISTORY}?filter=${TRANSACTION_TYPE.EXPENSE}`,
              )
            }
            className="flex-1 flex-row items-center justify-between rounded-2xl border border-border bg-card p-4"
          >
            <View>
              <Text className="text-xs text-muted-foreground">Spent</Text>
              <Text className="mt-1 text-lg font-bold text-negative">
                {formatINR(expenses)}
              </Text>
            </View>
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          </Pressable>
        </View>
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5 pt-4">
        <Text className="mb-3 text-sm font-semibold text-muted-foreground">
          Recent Transactions
        </Text>

        <FlashList
          data={listData}
          keyExtractor={(item) =>
            item.type === "header" ? `h-${item.label}` : `t-${item.data.id}`
          }
          getItemType={(item) => item.type}
          renderItem={({ item }: { item: ListItem }) =>
            item.type === "header" ? (
              <DateHeader label={item.label} />
            ) : (
              <TransactionItem
                item={item.data}
                onPress={(id) => router.push(editScreen(id))}
              />
            )
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>

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
          <Pressable className="items-center gap-1">
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

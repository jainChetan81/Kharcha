import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { router } from "expo-router";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import {
  getMonthlySummary,
  getRecentTransactions,
  type TransactionRow,
} from "@/lib/db";

const CATEGORY_ICONS: Record<string, string> = {
  food: "🛒",
  transport: "🚕",
  shopping: "🛍️",
  utilities: "⚡",
  entertainment: "🎬",
  health: "🏋️",
  salary: "💰",
  freelance: "💼",
  other: "📦",
};

function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function getDateLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

function groupByDate(transactions: TransactionRow[]) {
  const groups: { label: string; items: TransactionRow[] }[] = [];
  for (const t of transactions) {
    const label = getDateLabel(t.date);
    const existing = groups.find((g) => g.label === label);
    if (existing) {
      existing.items.push(t);
    } else {
      groups.push({ label, items: [t] });
    }
  }
  return groups;
}

function SummaryCard({
  label,
  amount,
  icon,
  bg,
}: {
  label: string;
  amount: string;
  icon: string;
  bg: string;
}) {
  return (
    <View className={`flex-1 rounded-2xl p-4 ${bg}`}>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-sm">{icon}</Text>
        <Text className="text-sm font-medium text-white/80">{label}</Text>
      </View>
      <Text className="mt-2 text-xl font-bold text-white">{amount}</Text>
    </View>
  );
}

function TransactionItem({ item }: { item: TransactionRow }) {
  const isIncome = item.type === "income";
  const icon =
    CATEGORY_ICONS[item.category_name ?? ""] ?? (isIncome ? "💰" : "📦");
  return (
    <View className="mb-2.5 flex-row items-center rounded-2xl bg-white p-4">
      <View
        className={`h-12 w-12 items-center justify-center rounded-xl ${isIncome ? "bg-green-50" : "bg-slate-100"}`}
      >
        <Text className="text-2xl">{icon}</Text>
      </View>
      <View className="ml-3.5 flex-1">
        <Text className="text-base font-semibold text-slate-800">
          {item.merchant || item.category_name || item.type}
        </Text>
        <Text className="mt-0.5 text-xs capitalize text-slate-400">
          {item.category_name ?? "uncategorized"}
          {item.source_name ? ` · ${item.source_name}` : ""}
        </Text>
      </View>
      <Text
        className={`text-base font-bold ${isIncome ? "text-green-600" : "text-slate-800"}`}
      >
        {isIncome ? "+" : "-"}
        {formatINR(item.amount)}
      </Text>
    </View>
  );
}

function DateGroup({
  label,
  items,
}: {
  label: string;
  items: TransactionRow[];
}) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </Text>
      {items.map((item) => (
        <TransactionItem key={item.id} item={item} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const currentMonth = format(new Date(), "yyyy-MM");

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => getRecentTransactions(20),
  });

  const { data: summary } = useQuery({
    queryKey: ["monthly-summary", currentMonth],
    queryFn: () => getMonthlySummary(currentMonth),
  });

  const income = summary?.total_income ?? 0;
  const expenses = summary?.total_expenses ?? 0;
  const balance = income - expenses;
  const budgetLimit = 20000;
  const budgetPercent = Math.min(
    Math.round((expenses / budgetLimit) * 100),
    100,
  );
  const grouped = groupByDate(transactions);

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View
        className="bg-slate-900 px-6 pb-7"
        style={{ paddingTop: Platform.OS === "ios" ? 60 : 48 }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-bold text-white">Hello, Chetan</Text>
            <Text className="mt-0.5 text-sm text-slate-400">
              {format(new Date(), "MMMM yyyy")}
            </Text>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-indigo-500">
            <Text className="text-base font-bold text-white">CJ</Text>
          </View>
        </View>

        {/* Balance */}
        <View className="mt-6 items-center rounded-2xl bg-slate-800 p-5">
          <Text className="text-xs font-medium uppercase tracking-widest text-slate-400">
            Total Balance
          </Text>
          <Text className="mt-1 text-4xl font-extrabold text-white">
            {formatINR(balance)}
          </Text>

          {/* Budget bar */}
          <View className="mt-4 w-full">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-slate-400">Monthly budget</Text>
              <Text className="text-xs font-semibold text-slate-300">
                {formatINR(expenses)} / {formatINR(budgetLimit)}
              </Text>
            </View>
            <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <View
                className={`h-full rounded-full ${budgetPercent > 80 ? "bg-red-400" : "bg-indigo-400"}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </View>
          </View>
        </View>

        {/* Summary Cards */}
        <View className="mt-4 flex-row gap-3">
          <SummaryCard
            label="Income"
            amount={formatINR(income)}
            icon="↓"
            bg="bg-green-600"
          />
          <SummaryCard
            label="Spent"
            amount={formatINR(expenses)}
            icon="↑"
            bg="bg-red-500"
          />
        </View>
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5 pt-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">
            Recent Transactions
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {grouped.length === 0 ? (
            <View className="items-center py-16">
              <Text className="text-base text-slate-400">
                No transactions yet
              </Text>
              <Text className="mt-1 text-sm text-slate-300">
                Tap + to add your first one
              </Text>
            </View>
          ) : (
            grouped.map((group) => (
              <DateGroup
                key={group.label}
                label={group.label}
                items={group.items}
              />
            ))
          )}
          <View className="h-6" />
        </ScrollView>
      </View>

      {/* Bottom Nav */}
      <View
        className="flex-row items-center justify-around border-t border-slate-100 bg-white px-4 pt-3"
        style={{ paddingBottom: Platform.OS === "ios" ? 28 : 12 }}
      >
        <View className="items-center gap-1">
          <Text className="text-xl">🏠</Text>
          <Text className="text-xs font-bold text-indigo-500">Home</Text>
        </View>
        <View className="items-center gap-1">
          <Text className="text-xl">📊</Text>
          <Text className="text-xs font-medium text-slate-400">Stats</Text>
        </View>
        <Pressable className="-mt-8" onPress={() => router.push("/add")}>
          <View className="h-14 w-14 items-center justify-center rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/40">
            <Text className="text-3xl font-semibold text-white">+</Text>
          </View>
        </Pressable>
        <View className="items-center gap-1">
          <Text className="text-xl">🔔</Text>
          <Text className="text-xs font-medium text-slate-400">Alerts</Text>
        </View>
        <View className="items-center gap-1">
          <Text className="text-xl">⚙️</Text>
          <Text className="text-xs font-medium text-slate-400">Settings</Text>
        </View>
      </View>
    </View>
  );
}

import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { router } from "expo-router";
import { Clock, House, Plus, Settings, User } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  getMonthlySummary,
  getRecentTransactions,
  type TransactionRow,
} from "@/lib/db";
import { cn, isIOS } from "@/lib/utils";

function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(" ", "T"));
}

function getDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
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

function TransactionItem({ item }: { item: TransactionRow }) {
  const isIncome = item.type === "income";
  return (
    <View className="mb-2 flex-row items-center rounded-2xl border border-border bg-card p-4">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
        <Text className="text-sm font-semibold text-muted-foreground">
          {(item.category_name ?? "?")[0].toUpperCase()}
        </Text>
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-foreground">
          {item.merchant || item.category_name || item.type}
        </Text>
        <Text className="mt-0.5 text-xs capitalize text-muted-foreground">
          {item.category_name ?? "uncategorized"}
          {item.source_name ? ` · ${item.source_name}` : ""}
        </Text>
      </View>
      <Text
        className={`text-sm font-bold ${isIncome ? "text-positive" : "text-negative"}`}
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
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
  const grouped = groupByDate(transactions);

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

        {/* Balance */}
        <View className="mt-5 items-center rounded-2xl border border-border bg-card p-5">
          <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Total Balance
          </Text>
          <Text className="mt-1 text-4xl font-extrabold text-foreground">
            {formatINR(balance)}
          </Text>
        </View>

        {/* Summary Cards */}
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Income</Text>
            <Text className="mt-1.5 text-xl font-bold text-positive">
              {formatINR(income)}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Spent</Text>
            <Text className="mt-1.5 text-xl font-bold text-negative">
              {formatINR(expenses)}
            </Text>
          </View>
        </View>
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5 pt-4">
        <Text className="mb-3 text-sm font-semibold text-muted-foreground">
          Recent Transactions
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {grouped.map((group) => (
            <DateGroup
              key={group.label}
              label={group.label}
              items={group.items}
            />
          ))}
          <View className="h-6" />
        </ScrollView>
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
          <View className="items-center gap-1">
            <Icon as={Clock} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
              History
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/add")}
            style={{ marginTop: -44, marginBottom: 8 }}
          >
            <View
              className="h-[60px] w-[60px] items-center justify-center rounded-full bg-primary"
              style={{
                elevation: 8,
                shadowColor: "#7c3aed",
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Icon as={Plus} className="size-7 text-primary-foreground" />
            </View>
          </Pressable>
          <View className="items-center gap-1">
            <Icon as={Settings} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
              Settings
            </Text>
          </View>
          <View className="items-center gap-1">
            <Icon as={User} className="size-5 text-muted-foreground" />
            <Text className="text-[11px] font-medium text-muted-foreground">
              Profile
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

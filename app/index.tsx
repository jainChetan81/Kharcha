import { Platform, Pressable, ScrollView, Text, View } from "react-native";

const TRANSACTIONS = [
  { id: 1, title: "Groceries", category: "Food", amount: -2450, date: "Today", icon: "🛒" },
  { id: 2, title: "Salary", category: "Income", amount: 85000, date: "Today", icon: "💰" },
  { id: 3, title: "Uber Ride", category: "Transport", amount: -320, date: "Yesterday", icon: "🚕" },
  { id: 4, title: "Netflix", category: "Entertainment", amount: -649, date: "Yesterday", icon: "🎬" },
  { id: 5, title: "Electricity Bill", category: "Bills", amount: -1800, date: "Earlier", icon: "⚡" },
  { id: 6, title: "Freelance Work", category: "Income", amount: 15000, date: "Earlier", icon: "💼" },
  { id: 7, title: "Zomato", category: "Food", amount: -580, date: "Earlier", icon: "🍕" },
  { id: 8, title: "Gym Membership", category: "Health", amount: -1500, date: "Earlier", icon: "🏋️" },
];

const CATEGORIES = ["All", "Food", "Transport", "Bills", "Income"];

function SummaryCard({
  label,
  amount,
  icon,
  bg,
}: { label: string; amount: string; icon: string; bg: string }) {
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

function TransactionItem({ item }: { item: (typeof TRANSACTIONS)[0] }) {
  const isIncome = item.amount > 0;
  return (
    <View className="mb-2.5 flex-row items-center rounded-2xl bg-white p-4">
      <View
        className={`h-12 w-12 items-center justify-center rounded-xl ${isIncome ? "bg-green-50" : "bg-slate-100"}`}
      >
        <Text className="text-2xl">{item.icon}</Text>
      </View>
      <View className="ml-3.5 flex-1">
        <Text className="text-base font-semibold text-slate-800">{item.title}</Text>
        <Text className="mt-0.5 text-xs text-slate-400">{item.category}</Text>
      </View>
      <Text className={`text-base font-bold ${isIncome ? "text-green-600" : "text-slate-800"}`}>
        {isIncome ? "+" : "-"}₹{Math.abs(item.amount).toLocaleString("en-IN")}
      </Text>
    </View>
  );
}

function DateGroup({ label, items }: { label: string; items: typeof TRANSACTIONS }) {
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
  const grouped = TRANSACTIONS.reduce(
    (acc, t) => {
      if (!acc[t.date]) {
        acc[t.date] = [];
      }
      acc[t.date].push(t);
      return acc;
    },
    {} as Record<string, typeof TRANSACTIONS>,
  );

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
            <Text className="mt-0.5 text-sm text-slate-400">March 2026</Text>
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
          <Text className="mt-1 text-4xl font-extrabold text-white">₹92,701</Text>

          {/* Budget bar */}
          <View className="mt-4 w-full">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-slate-400">Monthly budget</Text>
              <Text className="text-xs font-semibold text-slate-300">₹7,299 / ₹20,000</Text>
            </View>
            <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <View className="h-full w-[36%] rounded-full bg-indigo-400" />
            </View>
          </View>
        </View>

        {/* Summary Cards */}
        <View className="mt-4 flex-row gap-3">
          <SummaryCard label="Income" amount="₹1,00,000" icon="↓" bg="bg-green-600" />
          <SummaryCard label="Spent" amount="₹7,299" icon="↑" bg="bg-red-500" />
        </View>
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-12 px-5 pt-5"
        contentContainerStyle={{ gap: 8 }}
      >
        {CATEGORIES.map((cat, i) => (
          <Pressable
            key={cat}
            className={`rounded-full px-4 py-2 ${i === 0 ? "bg-indigo-500" : "bg-white"}`}
          >
            <Text
              className={`text-sm font-semibold ${i === 0 ? "text-white" : "text-slate-500"}`}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Transactions */}
      <View className="flex-1 px-5 pt-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Transactions</Text>
          <Text className="text-sm font-semibold text-indigo-500">See All</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {Object.entries(grouped).map(([date, items]) => (
            <DateGroup key={date} label={date} items={items} />
          ))}
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
        <View className="-mt-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/40">
            <Text className="text-3xl font-semibold text-white">+</Text>
          </View>
        </View>
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

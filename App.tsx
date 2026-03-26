import "./global.css";
import { StatusBar } from "expo-status-bar";
import { Text, View, ScrollView, Platform } from "react-native";

const TRANSACTIONS = [
  { id: 1, title: "Groceries", category: "Food", amount: -2450, date: "Today", icon: "🛒" },
  { id: 2, title: "Salary", category: "Income", amount: 85000, date: "Yesterday", icon: "💰" },
  { id: 3, title: "Uber Ride", category: "Transport", amount: -320, date: "Yesterday", icon: "🚕" },
  { id: 4, title: "Netflix", category: "Entertainment", amount: -649, date: "Mar 25", icon: "🎬" },
  { id: 5, title: "Electricity Bill", category: "Bills", amount: -1800, date: "Mar 24", icon: "⚡" },
  { id: 6, title: "Freelance Work", category: "Income", amount: 15000, date: "Mar 23", icon: "💼" },
  { id: 7, title: "Zomato", category: "Food", amount: -580, date: "Mar 22", icon: "🍕" },
  { id: 8, title: "Gym Membership", category: "Health", amount: -1500, date: "Mar 21", icon: "🏋️" },
];

function SummaryCard({ label, amount, bg }: { label: string; amount: string; bg: string }) {
  return (
    <View className={`flex-1 rounded-2xl p-4 ${bg}`}>
      <Text className="text-sm font-medium text-white/80">{label}</Text>
      <Text className="mt-1.5 text-xl font-bold text-white">{amount}</Text>
    </View>
  );
}

function TransactionItem({ item }: { item: (typeof TRANSACTIONS)[0] }) {
  const isIncome = item.amount > 0;
  return (
    <View className="mb-2.5 flex-row items-center rounded-2xl bg-white p-4 shadow-sm">
      <View className="h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Text className="text-2xl">{item.icon}</Text>
      </View>
      <View className="ml-3.5 flex-1">
        <Text className="text-base font-semibold text-slate-800">{item.title}</Text>
        <Text className="mt-0.5 text-xs text-slate-400">
          {item.category} · {item.date}
        </Text>
      </View>
      <Text className={`text-base font-bold ${isIncome ? "text-green-600" : "text-slate-800"}`}>
        {isIncome ? "+" : "-"}₹{Math.abs(item.amount).toLocaleString("en-IN")}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <View className="flex-1 bg-slate-100">
      <StatusBar style="light" />

      {/* Header */}
      <View
        className="rounded-b-3xl bg-slate-900 px-6 pb-8"
        style={{ paddingTop: Platform.OS === "ios" ? 60 : 48 }}
      >
        <Text className="text-xl font-bold text-white">Hello, Chetan 👋</Text>
        <Text className="mt-1 text-sm text-slate-400">Here's your spending overview</Text>

        {/* Balance */}
        <View className="mt-7 items-center">
          <Text className="text-xs font-medium uppercase tracking-widest text-slate-400">
            Total Balance
          </Text>
          <Text className="mt-1 text-4xl font-extrabold text-white">₹92,701</Text>
        </View>

        {/* Summary Cards */}
        <View className="mt-5 flex-row gap-3">
          <SummaryCard label="Income" amount="₹1,00,000" bg="bg-green-600" />
          <SummaryCard label="Expenses" amount="₹7,299" bg="bg-red-500" />
        </View>
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5 pt-6">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-slate-900">Recent Transactions</Text>
          <Text className="text-sm font-semibold text-indigo-500">See All</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          {TRANSACTIONS.map((item) => (
            <TransactionItem key={item.id} item={item} />
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

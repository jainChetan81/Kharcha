import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, Platform } from 'react-native';

const TRANSACTIONS = [
  { id: 1, title: 'Groceries', category: 'Food', amount: -2450, date: 'Today', icon: '🛒' },
  { id: 2, title: 'Salary', category: 'Income', amount: 85000, date: 'Yesterday', icon: '💰' },
  { id: 3, title: 'Uber Ride', category: 'Transport', amount: -320, date: 'Yesterday', icon: '🚕' },
  { id: 4, title: 'Netflix', category: 'Entertainment', amount: -649, date: 'Mar 25', icon: '🎬' },
  { id: 5, title: 'Electricity Bill', category: 'Bills', amount: -1800, date: 'Mar 24', icon: '⚡' },
  { id: 6, title: 'Freelance Work', category: 'Income', amount: 15000, date: 'Mar 23', icon: '💼' },
  { id: 7, title: 'Zomato', category: 'Food', amount: -580, date: 'Mar 22', icon: '🍕' },
  { id: 8, title: 'Gym Membership', category: 'Health', amount: -1500, date: 'Mar 21', icon: '🏋️' },
];

function SummaryCard({ label, amount, color }: { label: string; amount: string; color: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: color }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryAmount}>{amount}</Text>
    </View>
  );
}

function TransactionItem({ item }: { item: typeof TRANSACTIONS[0] }) {
  const isIncome = item.amount > 0;
  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionIcon}>
        <Text style={{ fontSize: 24 }}>{item.icon}</Text>
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle}>{item.title}</Text>
        <Text style={styles.transactionCategory}>{item.category} · {item.date}</Text>
      </View>
      <Text style={[styles.transactionAmount, { color: isIncome ? '#16a34a' : '#1e293b' }]}>
        {isIncome ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, Chetan 👋</Text>
        <Text style={styles.headerSubtitle}>Here's your spending overview</Text>

        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>₹92,701</Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard label="Income" amount="₹1,00,000" color="#16a34a" />
          <SummaryCard label="Expenses" amount="₹7,299" color="#ef4444" />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <Text style={styles.seeAll}>See All</Text>
        </View>

        <ScrollView
          style={styles.transactionList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {TRANSACTIONS.map((item) => (
            <TransactionItem key={item.id} item={item} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottomNav}>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navLabel, styles.navActive]}>Home</Text>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>📊</Text>
          <Text style={styles.navLabel}>Stats</Text>
        </View>
        <View style={styles.addButtonContainer}>
          <View style={styles.addButton}>
            <Text style={styles.addButtonText}>+</Text>
          </View>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>🔔</Text>
          <Text style={styles.navLabel}>Alerts</Text>
        </View>
        <View style={styles.navItem}>
          <Text style={styles.navIcon}>⚙️</Text>
          <Text style={styles.navLabel}>Settings</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  // Header
  header: {
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: 24,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },

  // Balance
  balanceContainer: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 13,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  balanceAmount: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 6,
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  seeAll: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '600',
  },

  // Transactions
  transactionList: {
    flex: 1,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 14,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  transactionCategory: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 3,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Bottom Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    gap: 4,
  },
  navIcon: {
    fontSize: 20,
  },
  navLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  navActive: {
    color: '#6366f1',
    fontWeight: '700',
  },
  addButtonContainer: {
    marginTop: -30,
  },
  addButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonText: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: -2,
  },
});

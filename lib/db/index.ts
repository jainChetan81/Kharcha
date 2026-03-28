import { and, count, desc, eq, gte, lte, min, sql } from "drizzle-orm";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";
import {
  type Category,
  categories,
  type NewCategory,
  type NewSource,
  type NewTransaction,
  type Source,
  sources,
  type Transaction,
  transactions,
} from "./schema";

export type {
  Category,
  NewCategory,
  NewSource,
  NewTransaction,
  Source,
  Transaction,
};

const expo = SQLite.openDatabaseSync(DB_NAME);
const db: ExpoSQLiteDatabase = drizzle(expo, { logger: __DEV__ });

export type TransactionRow = Transaction & {
  category_name: string | null;
  source_name: string | null;
};

export type MonthlySummary = {
  total_income: number;
  total_expenses: number;
};

export async function initDB() {
  // Create tables using raw SQL for CREATE IF NOT EXISTS
  await expo.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      merchant TEXT,
      category_id INTEGER REFERENCES categories(id),
      source_id INTEGER REFERENCES sources(id),
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      billing_day INTEGER NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      source_id INTEGER REFERENCES sources(id),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER UNIQUE REFERENCES categories(id),
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('currency', 'INR'),
      ('userName', 'User');
  `);

  // Migration: add type column to transactions if missing
  const txCols = await expo.getAllAsync<{ name: string }>(
    "PRAGMA table_info(transactions)",
  );
  if (!txCols.some((c) => c.name === "type")) {
    await expo.execAsync(
      "ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    );
  }

  // Migration: add type column to categories if missing
  const catCols = await expo.getAllAsync<{ name: string }>(
    "PRAGMA table_info(categories)",
  );
  if (!catCols.some((c) => c.name === "type")) {
    await expo.execAsync(
      "ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    );
    await expo.execAsync(
      "UPDATE categories SET type = 'income' WHERE name IN ('salary', 'freelance')",
    );
    await expo.execAsync(`
      INSERT INTO categories (name, type, is_default) VALUES
        ('refunds', 'income', 1),
        ('investments', 'income', 1),
        ('other', 'income', 1);
    `);
  }

  // Migration: add subscription_id column to transactions if missing
  if (!txCols.some((c) => c.name === "subscription_id")) {
    await expo.execAsync(
      "ALTER TABLE transactions ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id)",
    );
  }

  await seedDefaults();
  await seedTransactions();
}

async function seedDefaults() {
  const existing = await db.select().from(categories).limit(1);
  if (existing.length === 0) {
    await db.insert(categories).values([
      { name: "food", type: "expense", is_default: 1 },
      { name: "transport", type: "expense", is_default: 1 },
      { name: "shopping", type: "expense", is_default: 1 },
      { name: "utilities", type: "expense", is_default: 1 },
      { name: "entertainment", type: "expense", is_default: 1 },
      { name: "health", type: "expense", is_default: 1 },
      { name: "other", type: "expense", is_default: 1 },
      { name: "salary", type: "income", is_default: 1 },
      { name: "freelance", type: "income", is_default: 1 },
      { name: "refunds", type: "income", is_default: 1 },
      { name: "investments", type: "income", is_default: 1 },
      { name: "other", type: "income", is_default: 1 },
    ]);
  }

  const existingSources = await db.select().from(sources).limit(1);
  if (existingSources.length === 0) {
    await db.insert(sources).values([
      { name: "cash", is_default: 1 },
      { name: "upi", is_default: 1 },
      { name: "credit card", is_default: 1 },
      { name: "debit card", is_default: 1 },
    ]);
  }
}

async function seedTransactions() {
  const existing = await db.select().from(transactions).limit(1);
  if (existing.length > 0) return;

  // Use raw SQL for date('now') functions
  await expo.execAsync(`
    INSERT INTO transactions (type, amount, merchant, category_id, source_id, date, note) VALUES
      ('expense', 450,   'Swiggy',          1, 2, date('now'),             null),
      ('expense', 1200,  'Uber',            2, 2, date('now'),             null),
      ('expense', 120,   'Chai Point',      1, 2, date('now'),             null),
      ('expense', 2800,  'DMart',           3, 1, date('now', '-1 day'),   null),
      ('income',  85000, 'Salary',          8, null, date('now', '-1 day'), 'March salary'),
      ('expense', 250,   'Auto',            2, 1, date('now', '-1 day'),   null),
      ('expense', 649,   'Netflix',         5, 3, date('now', '-2 days'),  null),
      ('expense', 350,   'Starbucks',       1, 2, date('now', '-2 days'),  null),
      ('expense', 199,   'Spotify',         5, 3, date('now', '-2 days'),  null),
      ('expense', 1800,  'Electricity',     4, 2, date('now', '-3 days'),  'March bill'),
      ('expense', 500,   'Zomato',          1, 2, date('now', '-3 days'),  null),
      ('expense', 150,   'Tea Trails',      1, 1, date('now', '-3 days'),  null),
      ('income',  15000, 'Freelance gig',   9, null, date('now', '-4 days'), 'Logo design'),
      ('expense', 3200,  'Amazon',          3, 3, date('now', '-5 days'),  'Headphones'),
      ('expense', 800,   'Flipkart',        3, 3, date('now', '-5 days'),  'Phone case'),
      ('expense', 1500,  'Gym',             6, 2, date('now', '-6 days'),  'Monthly fee'),
      ('expense', 400,   'Pharmacy',        6, 1, date('now', '-6 days'),  null),
      ('expense', 2200,  'Myntra',          3, 3, date('now', '-7 days'),  'Shoes'),
      ('expense', 180,   'Metro',           2, 2, date('now', '-7 days'),  null),
      ('income',  5000,  'Refund',          10, null, date('now', '-7 days'), 'Amazon refund'),
      ('expense', 950,   'BigBasket',       1, 2, date('now', '-8 days'),  null),
      ('expense', 1200,  'Ola',             2, 2, date('now', '-8 days'),  null),
      ('expense', 350,   'McDonald',        1, 1, date('now', '-9 days'),  null),
      ('expense', 2500,  'Croma',           3, 3, date('now', '-9 days'),  'USB cable'),
      ('expense', 600,   'Dominos',         1, 2, date('now', '-10 days'), null),
      ('expense', 1100,  'Gas Bill',        4, 2, date('now', '-10 days'), null),
      ('income',  8000,  'Side project',    9, null, date('now', '-11 days'), 'Website fix'),
      ('expense', 450,   'Rapido',          2, 2, date('now', '-12 days'), null),
      ('expense', 3500,  'Water purifier',  4, 3, date('now', '-13 days'), 'AMC renewal'),
      ('expense', 280,   'Dunzo',           1, 2, date('now', '-14 days'), null),
      -- Last month seed data
      ('income',  80000, 'Salary',          8, null, date('now', '-1 month', 'start of month', '+1 day'), 'Feb salary'),
      ('expense', 3200,  'Swiggy',          1, 2, date('now', '-1 month', 'start of month', '+2 days'), null),
      ('expense', 1800,  'Uber',            2, 2, date('now', '-1 month', 'start of month', '+3 days'), null),
      ('expense', 4500,  'Amazon',          3, 3, date('now', '-1 month', 'start of month', '+5 days'), 'Backpack'),
      ('expense', 649,   'Netflix',         5, 3, date('now', '-1 month', 'start of month', '+6 days'), null),
      ('expense', 1800,  'Electricity',     4, 2, date('now', '-1 month', 'start of month', '+8 days'), 'Feb bill'),
      ('expense', 2500,  'DMart',           3, 1, date('now', '-1 month', 'start of month', '+10 days'), null),
      ('expense', 1500,  'Gym',             6, 2, date('now', '-1 month', 'start of month', '+12 days'), 'Monthly fee'),
      ('expense', 950,   'BigBasket',       1, 2, date('now', '-1 month', 'start of month', '+15 days'), null),
      ('expense', 1200,  'Ola',             2, 2, date('now', '-1 month', 'start of month', '+18 days'), null),
      ('expense', 199,   'Spotify',         5, 3, date('now', '-1 month', 'start of month', '+20 days'), null),
      ('expense', 3500,  'Croma',           3, 3, date('now', '-1 month', 'start of month', '+22 days'), 'Charger');
  `);
}

function transactionSelect() {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      merchant: transactions.merchant,
      category_id: transactions.category_id,
      source_id: transactions.source_id,
      subscription_id: transactions.subscription_id,
      date: transactions.date,
      note: transactions.note,
      created_at: transactions.created_at,
      category_name: categories.name,
      source_name: sources.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category_id, categories.id))
    .leftJoin(sources, eq(transactions.source_id, sources.id));
}

export async function getRecentTransactions(limit = 20) {
  return (await transactionSelect()
    .orderBy(desc(transactions.date), desc(transactions.created_at))
    .limit(limit)) as TransactionRow[];
}

export async function getMonthlySummary(yearMonth: string) {
  const result = await db
    .select({
      total_income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      total_expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`);
  return result[0] as MonthlySummary;
}

export async function getAllCategories() {
  return (await db.select().from(categories)) as Category[];
}

export async function getCategoriesByType(type: "income" | "expense") {
  return (await db
    .select()
    .from(categories)
    .where(eq(categories.type, type))) as Category[];
}

export async function getAllSources() {
  return (await db.select().from(sources)) as Source[];
}

export async function getTransactionsPaginated(
  limit = 10,
  offset = 0,
  filters?: {
    type?: "income" | "expense" | "all";
    categoryId?: number | null;
    sourceId?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  },
) {
  const conditions = [];

  if (filters?.type && filters.type !== "all") {
    conditions.push(eq(transactions.type, filters.type));
  }
  if (filters?.categoryId) {
    conditions.push(eq(transactions.category_id, filters.categoryId));
  }
  if (filters?.sourceId) {
    conditions.push(eq(transactions.source_id, filters.sourceId));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(transactions.date, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(transactions.date, `${filters.dateTo} 23:59`));
  }

  const query = transactionSelect()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.created_at))
    .limit(limit)
    .offset(offset);

  return (await query) as TransactionRow[];
}

export async function getTransactionById(id: number) {
  const result = await transactionSelect().where(eq(transactions.id, id));
  return (result[0] ?? null) as TransactionRow | null;
}

export async function insertTransaction(params: {
  type: "income" | "expense";
  amount: number;
  merchant: string | null;
  categoryId: number | null;
  sourceId: number | null;
  subscriptionId?: number | null;
  date: string;
  note: string | null;
}) {
  return db.insert(transactions).values({
    type: params.type,
    amount: params.amount,
    merchant: params.merchant,
    category_id: params.categoryId,
    source_id: params.sourceId,
    subscription_id: params.subscriptionId ?? null,
    date: params.date,
    note: params.note,
  });
}

export async function updateTransaction(
  id: number,
  params: {
    type: "income" | "expense";
    amount: number;
    merchant: string | null;
    categoryId: number | null;
    sourceId: number | null;
    date: string;
    note: string | null;
  },
) {
  return db
    .update(transactions)
    .set({
      type: params.type,
      amount: params.amount,
      merchant: params.merchant,
      category_id: params.categoryId,
      source_id: params.sourceId,
      date: params.date,
      note: params.note,
    })
    .where(eq(transactions.id, id));
}

export async function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id));
}

export async function addCategory(name: string, type: "income" | "expense") {
  return db.insert(categories).values({ name, type, is_default: 0 });
}

export async function deleteCategory(id: number) {
  return db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.is_default, 0)));
}

export async function addSource(name: string) {
  return db.insert(sources).values({ name, is_default: 0 });
}

export async function deleteSource(id: number) {
  return db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
}

export async function reinsertTransaction(row: {
  type: "income" | "expense";
  amount: number;
  merchant: string | null;
  category_id: number | null;
  source_id: number | null;
  date: string;
  note: string | null;
  created_at: string | null;
}) {
  return db.insert(transactions).values({
    type: row.type,
    amount: row.amount,
    merchant: row.merchant,
    category_id: row.category_id,
    source_id: row.source_id,
    date: row.date,
    created_at: row.created_at,
    note: row.note,
  });
}

export async function clearAllTransactions() {
  return db.delete(transactions);
}

export async function getDataStats() {
  const txCount = await db.select({ value: count() }).from(transactions);
  const catCount = await db.select({ value: count() }).from(categories);
  const srcCount = await db.select({ value: count() }).from(sources);
  const firstDate = await db
    .select({ value: min(transactions.date) })
    .from(transactions);

  return {
    total_transactions: txCount[0]?.value ?? 0,
    total_categories: catCount[0]?.value ?? 0,
    total_sources: srcCount[0]?.value ?? 0,
    first_transaction_date: firstDate[0]?.value ?? null,
  };
}

export type CategoryBreakdownRow = {
  category_id: number;
  category_name: string;
  total: number;
  percentage: number;
};

export async function getCategoryBreakdown(yearMonth: string) {
  const rows = await db
    .select({
      category_id: transactions.category_id,
      category_name: categories.name,
      total: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category_id, categories.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
      ),
    )
    .groupBy(transactions.category_id)
    .orderBy(sql`SUM(${transactions.amount}) DESC`)
    .limit(5);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return rows.map((r) => ({
    category_id: r.category_id as number,
    category_name: r.category_name ?? "Unknown",
    total: r.total,
    percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
  })) as CategoryBreakdownRow[];
}

// Default export: raw expo-sqlite instance for backward compat
export { db };
export default expo;

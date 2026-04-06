import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { CONFIG_KEYS, type SourceType } from "@/lib/constants";
import { db } from "./connection";
import { categories, config, sources, transactions } from "./schema";
import type {
  CategoryBreakdownRow,
  MonthlySummary,
  TransactionRow,
} from "./types";

export { db } from "./connection";
export type {
  Category,
  CategoryBreakdownRow,
  MonthlySummary,
  Source,
  Transaction,
  TransactionRow,
} from "./types";

export async function initDB() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      is_default INTEGER DEFAULT 0
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      billing_day INTEGER NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      source_id INTEGER REFERENCES sources(id),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      merchant TEXT,
      category_id INTEGER REFERENCES categories(id),
      source_id INTEGER REFERENCES sources(id),
      subscription_id INTEGER REFERENCES subscriptions(id),
      source_type TEXT NOT NULL DEFAULT 'manual',
      gmail_message_id TEXT,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER UNIQUE REFERENCES categories(id),
      amount REAL NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Add gmail_message_id column if missing (existing DBs won't have it
  // since CREATE TABLE IF NOT EXISTS doesn't alter existing tables)
  try {
    await db.run(
      sql`ALTER TABLE transactions ADD COLUMN gmail_message_id TEXT`,
    );
  } catch {
    // Column already exists — safe to ignore
  }

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_subscription_id ON transactions(subscription_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_source_type ON transactions(source_type)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS idx_transactions_gmail_message_id ON transactions(gmail_message_id)`,
  );

  await db
    .insert(config)
    .values([
      { key: CONFIG_KEYS.CURRENCY, value: "INR" },
      { key: CONFIG_KEYS.USER_NAME, value: "User" },
    ])
    .onConflictDoNothing();

  await seedDefaults();
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
      { name: "UPI", is_default: 1 },
      { name: "credit card", is_default: 1 },
      { name: "debit card", is_default: 1 },
    ]);
  }
}

export async function seedSampleData(): Promise<boolean> {
  const existing = await db.select().from(transactions).limit(1);
  if (existing.length > 0) return false;

  await db.run(sql`
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
      ('expense', 3500,  'Croma',           3, 3, date('now', '-1 month', 'start of month', '+22 days'), 'Charger')
  `);
  return true;
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
      source_type: transactions.source_type,
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

export async function getMonthTransactions(yearMonth: string, limit = 10) {
  return (await transactionSelect()
    .where(sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`)
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

export async function getTransactionsPaginated(
  limit = 10,
  offset = 0,
  filters?: {
    type?: "income" | "expense" | "all";
    categoryId?: number | null;
    sourceId?: number | null;
    sourceType?: SourceType | "all";
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string;
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
  if (filters?.sourceType && filters.sourceType !== "all") {
    conditions.push(eq(transactions.source_type, filters.sourceType));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(transactions.date, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(transactions.date, `${filters.dateTo} 23:59`));
  }
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(like(transactions.merchant, term), like(transactions.note, term)),
    );
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
  sourceType?: SourceType;
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
    source_type: params.sourceType ?? "manual",
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

export async function restoreTransaction(row: {
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

export async function syncedTransactionExists(
  date: string,
  amount: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.date, date),
        eq(transactions.amount, amount),
        eq(transactions.source_type, "synced"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export {
  addCategory,
  deleteCategory,
  getAllCategories,
  getCategoriesByType,
} from "./categories";
export { addSource, deleteSource, getAllSources } from "./sources";
export { getDataStats } from "./stats";

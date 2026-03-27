import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("kharcha.db");

// --- Types ---

export type Category = {
  id: number;
  name: string;
  type: "income" | "expense";
  is_default: number;
};
export type Source = { id: number; name: string; is_default: number };
export type TransactionRow = {
  id: number;
  type: "income" | "expense";
  amount: number;
  merchant: string | null;
  category_id: number | null;
  source_id: number | null;
  date: string;
  note: string | null;
  created_at: string;
  category_name: string | null;
  source_name: string | null;
};
export type MonthlySummary = {
  total_income: number;
  total_expenses: number;
};

// --- Init ---

export async function initDB() {
  await db.execAsync(`
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
  `);

  // Migration: add type column to transactions if missing
  const txCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(transactions)",
  );
  if (!txCols.some((c) => c.name === "type")) {
    await db.execAsync(
      "ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    );
  }

  // Migration: add type column to categories if missing
  const catCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(categories)",
  );
  if (!catCols.some((c) => c.name === "type")) {
    await db.execAsync(
      "ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    );
    // Update existing income categories
    await db.execAsync(
      "UPDATE categories SET type = 'income' WHERE name IN ('salary', 'freelance')",
    );
    // Seed missing income categories for existing databases
    await db.execAsync(`
      INSERT INTO categories (name, type, is_default) VALUES
        ('refunds', 'income', 1),
        ('investments', 'income', 1),
        ('other', 'income', 1);
    `);
  }

  await seedDefaults();
  await seedTransactions();
}

async function seedDefaults() {
  const categories = await db.getAllAsync("SELECT * FROM categories");
  if (categories.length === 0) {
    await db.execAsync(`
      INSERT INTO categories (name, type, is_default) VALUES
        ('food', 'expense', 1),
        ('transport', 'expense', 1),
        ('shopping', 'expense', 1),
        ('utilities', 'expense', 1),
        ('entertainment', 'expense', 1),
        ('health', 'expense', 1),
        ('other', 'expense', 1),
        ('salary', 'income', 1),
        ('freelance', 'income', 1),
        ('refunds', 'income', 1),
        ('investments', 'income', 1),
        ('other', 'income', 1);
    `);
  }

  const sources = await db.getAllAsync("SELECT * FROM sources");
  if (sources.length === 0) {
    await db.execAsync(`
      INSERT INTO sources (name, is_default) VALUES
        ('cash', 1),
        ('upi', 1),
        ('credit card', 1),
        ('debit card', 1);
    `);
  }
}

async function seedTransactions() {
  const existing = await db.getAllAsync("SELECT * FROM transactions");
  if (existing.length > 0) return;

  await db.execAsync(`
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
      ('expense', 280,   'Dunzo',           1, 2, date('now', '-14 days'), null);
  `);
}

// --- Queries ---

export function getRecentTransactions(limit = 20) {
  return db.getAllAsync<TransactionRow>(
    `SELECT t.*, c.name as category_name, s.name as source_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN sources s ON t.source_id = s.id
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export function getMonthlySummary(yearMonth: string) {
  return db.getFirstAsync<MonthlySummary>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses
     FROM transactions
     WHERE strftime('%Y-%m', date) = ?`,
    [yearMonth],
  );
}

export function getAllCategories() {
  return db.getAllAsync<Category>("SELECT * FROM categories");
}

export function getCategoriesByType(type: "income" | "expense") {
  return db.getAllAsync<Category>("SELECT * FROM categories WHERE type = ?", [
    type,
  ]);
}

export function getAllSources() {
  return db.getAllAsync<Source>("SELECT * FROM sources");
}

export function getTransactionsPaginated(
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
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.type && filters.type !== "all") {
    where.push("t.type = ?");
    params.push(filters.type);
  }
  if (filters?.categoryId) {
    where.push("t.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters?.sourceId) {
    where.push("t.source_id = ?");
    params.push(filters.sourceId);
  }
  if (filters?.dateFrom) {
    where.push("t.date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    where.push("t.date <= ?");
    params.push(`${filters.dateTo} 23:59`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return db.getAllAsync<TransactionRow>(
    `SELECT t.*, c.name as category_name, s.name as source_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN sources s ON t.source_id = s.id
     ${whereClause}
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}

export function insertTransaction(params: {
  type: "income" | "expense";
  amount: number;
  merchant: string | null;
  categoryId: number | null;
  sourceId: number | null;
  date: string;
  note: string | null;
}) {
  return db.runAsync(
    "INSERT INTO transactions (type, amount, merchant, category_id, source_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      params.type,
      params.amount,
      params.merchant,
      params.categoryId,
      params.sourceId,
      params.date,
      params.note,
    ],
  );
}

export function deleteTransaction(id: number) {
  return db.runAsync("DELETE FROM transactions WHERE id = ?", [id]);
}

export default db;

import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("kharcha.db");

// --- Types ---

export type Category = { id: number; name: string; is_default: number };
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

  // Migration: add type column for existing tables created before this change
  const cols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(transactions)",
  );
  if (!cols.some((c) => c.name === "type")) {
    await db.execAsync(
      "ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
    );
  }

  await seedDefaults();
}

async function seedDefaults() {
  const categories = await db.getAllAsync("SELECT * FROM categories");
  if (categories.length === 0) {
    await db.execAsync(`
      INSERT INTO categories (name, is_default) VALUES
        ('food', 1),
        ('transport', 1),
        ('shopping', 1),
        ('utilities', 1),
        ('entertainment', 1),
        ('health', 1),
        ('salary', 1),
        ('freelance', 1),
        ('other', 1);
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

export default db;

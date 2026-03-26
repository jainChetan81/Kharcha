import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("kharcha.db");

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
      amount REAL NOT NULL,
      merchant TEXT,
      category_id INTEGER REFERENCES categories(id),
      source_id INTEGER REFERENCES sources(id),
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

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

export default db;

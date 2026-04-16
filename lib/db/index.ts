import {
  addDays,
  differenceInDays,
  format,
  getDaysInMonth,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import {
  aliasedTable,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  CONFIG_KEYS,
  DATE_ISO_FORMAT,
  MAX_EXPORT_TRANSACTIONS,
  MONTH_FORMAT,
  OTHER_CATEGORY_LABEL,
  type ParsedByType,
  type SourceType,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { logFirebaseError, withTrace } from "@/lib/firebase";
import { transactionInputSchema } from "@/lib/validation";
import expo, { db, runMigrations } from "./connection";
import {
  bankEmails,
  banks,
  categories,
  config,
  sources,
  tags,
  transactions,
  transactionTags,
} from "./schema";
import { getTagsForTransactions } from "./tags";
import type {
  CategoryBreakdownRow,
  MonthlyInsights,
  MonthlySummary,
  TransactionRow,
} from "./types";

export { db } from "./connection";
export type {
  Category,
  CategoryBreakdownRow,
  MonthlyInsights,
  MonthlySummary,
  ReimbursementSummary,
  Source,
  Tag,
  TagBreakdownRow,
  TagLite,
  Transaction,
  TransactionRow,
} from "./types";

/**
 * Check whether a column exists on a table using SQLite's PRAGMA.
 *
 * Used to guard `ALTER TABLE ADD COLUMN` statements so we don't have to
 * swallow `catch {}` and risk hiding real errors (FK violations, locks,
 * etc). Safe on both fresh installs and restored-from-backup databases.
 */
function hasColumn(table: string, column: string): boolean {
  // `table` comes from hard-coded string literals in this module only —
  // never from user input — so interpolation into the PRAGMA is safe.
  const rows = expo.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

export async function initDB(): Promise<void> {
  return withTrace("db_init", async () => {
    try {
      // Run generated Drizzle migrations first. If none have been generated
      // yet (fresh clone), we fall through to the `CREATE TABLE IF NOT EXISTS`
      // safety net below so the app still boots.
      await runMigrations();

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )
  `);

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
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
      reimbursement_status TEXT NOT NULL DEFAULT 'none',
      reimbursed_at TEXT,
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

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parser_key TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    )
  `);

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS bank_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL REFERENCES banks(id),
      email TEXT NOT NULL,
      is_default INTEGER DEFAULT 0
    )
  `);

      await db.run(
        sql`CREATE INDEX IF NOT EXISTS idx_bank_emails_bank_id ON bank_emails(bank_id)`,
      );

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

      await db.run(sql`
    CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (transaction_id, tag_id)
    )
  `);

      await db.run(
        sql`CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag_id ON transaction_tags(tag_id)`,
      );

      // Back-fill columns that existing DBs (including restored backups from
      // older app versions) might be missing. Using PRAGMA `table_info` instead
      // of `try { ALTER } catch {}` so we don't silently swallow real errors
      // (FK violations, locks, etc). Once Drizzle migrations cover these, these
      // checks become no-ops and can be removed.
      if (!hasColumn("transactions", "gmail_message_id")) {
        await db.run(
          sql`ALTER TABLE transactions ADD COLUMN gmail_message_id TEXT`,
        );
      }

      if (!hasColumn("transactions", "destination_source_id")) {
        await db.run(
          sql`ALTER TABLE transactions ADD COLUMN destination_source_id INTEGER REFERENCES sources(id)`,
        );
      }

      if (!hasColumn("categories", "sort_order")) {
        await db.run(
          sql`ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0`,
        );
      }

      if (!hasColumn("sources", "sort_order")) {
        await db.run(
          sql`ALTER TABLE sources ADD COLUMN sort_order INTEGER DEFAULT 0`,
        );
      }

      if (!hasColumn("transactions", "parsed_by")) {
        await db.run(sql`ALTER TABLE transactions ADD COLUMN parsed_by TEXT`);
      }

      if (!hasColumn("transactions", "reimbursement_status")) {
        await db.run(
          sql`ALTER TABLE transactions ADD COLUMN reimbursement_status TEXT NOT NULL DEFAULT 'none'`,
        );
      }

      if (!hasColumn("transactions", "reimbursed_at")) {
        await db.run(
          sql`ALTER TABLE transactions ADD COLUMN reimbursed_at TEXT`,
        );
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
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS idx_transactions_reimbursement_status ON transactions(reimbursement_status)`,
      );

      await db
        .insert(config)
        .values([
          { key: CONFIG_KEYS.CURRENCY, value: "INR" },
          { key: CONFIG_KEYS.USER_NAME, value: "User" },
        ])
        .onConflictDoNothing();

      await seedDefaults();
    } catch (error) {
      logFirebaseError(error, { error_type: "DB_ERROR", operation: "init_db" });
      throw error;
    }
  });
}

async function seedDefaults() {
  const existing = await db.select().from(categories).limit(1);
  if (existing.length === 0) {
    await db.insert(categories).values([
      { name: "Food", type: "expense", is_default: 1, sort_order: 0 },
      { name: "Transport", type: "expense", is_default: 1, sort_order: 1 },
      { name: "Shopping", type: "expense", is_default: 1, sort_order: 2 },
      { name: "Utilities", type: "expense", is_default: 1, sort_order: 3 },
      { name: "Entertainment", type: "expense", is_default: 1, sort_order: 4 },
      { name: "Health", type: "expense", is_default: 1, sort_order: 5 },
      { name: "Other", type: "expense", is_default: 1, sort_order: 6 },
      { name: "Salary", type: "income", is_default: 1, sort_order: 0 },
      { name: "Refunds", type: "income", is_default: 1, sort_order: 1 },
      { name: "Other", type: "income", is_default: 1, sort_order: 2 },
    ]);
  }

  const existingSources = await db.select().from(sources).limit(1);
  if (existingSources.length === 0) {
    await db.insert(sources).values([
      { name: "UPI", is_default: 1, sort_order: 0 },
      { name: "Credit Card", is_default: 1, sort_order: 1 },
      { name: "Debit Card", is_default: 1, sort_order: 2 },
      { name: "Cash", is_default: 1, sort_order: 3 },
      { name: "Other", is_default: 1, sort_order: 4 },
    ]);
  }

  const seeds: {
    name: string;
    parser_key: string | null;
    is_active: boolean;
    emails: string[];
  }[] = [
    {
      name: "Axis Bank",
      parser_key: "axis",
      is_active: true,
      emails: [
        "alerts@axis.bank.in",
        "alerts@axisbank.com",
        "alerts@axis.bank.com",
      ],
    },
    {
      name: "HDFC Bank",
      parser_key: "hdfc",
      is_active: true,
      emails: [
        "alerts@hdfcbank.net",
        "alerts@hdfcbank.com",
        "alerts@hdfcbank.bank.in",
      ],
    },
    {
      name: "IndusInd Bank",
      parser_key: "indusind",
      is_active: false,
      emails: ["indusind_bank@indusind.com"],
    },
    {
      name: "ICICI Bank",
      parser_key: "icici",
      is_active: false,
      emails: [
        "alerts@icicibank.com",
        "credit_cards@icicibank.com",
        "customer.alerts@icicibank.com",
      ],
    },
    {
      name: "SBI",
      parser_key: "sbi",
      is_active: false,
      emails: ["alerts@sbi.co.in", "donotreply@sbi.co.in"],
    },
    {
      name: "Kotak",
      parser_key: "kotak",
      is_active: false,
      emails: [
        "alerts@kotak.com",
        "alerts@kotakbank.com",
        "creditcardalerts@kotak.com",
      ],
    },
    {
      name: "Standard Chartered",
      parser_key: "sc",
      is_active: false,
      emails: ["alerts@sc.com", "noreply@sc.com"],
    },
    {
      name: "IDFC First Bank",
      parser_key: "idfc",
      is_active: false,
      emails: ["alerts@idfcfirstbank.com", "noreply@idfcfirstbank.com"],
    },
    {
      name: "HSBC",
      parser_key: "hsbc",
      is_active: false,
      emails: ["alerts@hsbc.co.in", "noreply@hsbc.co.in"],
    },
    {
      name: "Citi Bank",
      parser_key: "citi",
      is_active: false,
      emails: ["alerts@citibank.com", "citicards@citibank.com"],
    },
    {
      name: "Slice",
      parser_key: "slice",
      is_active: false,
      emails: ["no-reply@sliceit.com", "alerts@sliceit.com"],
    },
    {
      name: "OneCard",
      parser_key: "onecard",
      is_active: false,
      emails: ["alerts@getonecard.app", "noreply@getonecard.app"],
    },
    {
      name: "Uni Card",
      parser_key: "uni",
      is_active: false,
      emails: ["alerts@uni.cards", "noreply@uni.cards"],
    },
  ];

  const existingBanksList = await db.select().from(banks);
  const existingByName = new Set(existingBanksList.map((b) => b.name));

  for (const seed of seeds) {
    if (existingByName.has(seed.name)) {
      // Update parser_key for existing banks (e.g. ICICI/SBI/Kotak that had null)
      if (seed.parser_key) {
        await db
          .update(banks)
          .set({ parser_key: seed.parser_key })
          .where(eq(banks.name, seed.name));
      }
      // Add any missing emails for existing banks
      const existing = existingBanksList.find((b) => b.name === seed.name);
      if (existing) {
        const existingEmails = await db
          .select()
          .from(bankEmails)
          .where(eq(bankEmails.bank_id, existing.id));
        const existingEmailSet = new Set(existingEmails.map((e) => e.email));
        const newEmails = seed.emails.filter(
          (email) => !existingEmailSet.has(email),
        );
        if (newEmails.length > 0) {
          await db.insert(bankEmails).values(
            newEmails.map((email) => ({
              bank_id: existing.id,
              email,
              is_default: 0,
            })),
          );
        }
      }
      continue;
    }
    const result = await db.insert(banks).values({
      name: seed.name,
      parser_key: seed.parser_key,
      is_default: 1,
      is_active: seed.is_active ? 1 : 0,
    });
    const bankId = Number(result.lastInsertRowId);
    await db.insert(bankEmails).values(
      seed.emails.map((email, i) => ({
        bank_id: bankId,
        email,
        is_default: i === 0 ? 1 : 0,
      })),
    );
  }
}

export async function seedSampleData(): Promise<boolean> {
  const existing = await db.select().from(transactions).limit(1);
  if (existing.length > 0) return false;

  const catRows = await db.select().from(categories);
  const srcRows = await db.select().from(sources);

  const catId = (name: string, type: "expense" | "income") =>
    catRows.find((c) => c.name === name && c.type === type)?.id ?? null;
  const srcId = (name: string) =>
    srcRows.find((s) => s.name === name)?.id ?? null;

  const FOOD = catId("Food", "expense");
  const TRANSPORT = catId("Transport", "expense");
  const SHOPPING = catId("Shopping", "expense");
  const UTILITIES = catId("Utilities", "expense");
  const ENTERTAINMENT = catId("Entertainment", "expense");
  const HEALTH = catId("Health", "expense");
  const SALARY = catId("Salary", "income");
  const REFUNDS = catId("Refunds", "income");
  const OTHER_INCOME = catId("Other", "income");

  const CASH = srcId("Cash");
  const UPI = srcId("UPI");
  const CREDIT = srcId("Credit Card");

  const today = new Date();
  const lastMonthStart = startOfMonth(subMonths(today, 1));
  const day = (n: number) => format(subDays(today, n), DATE_ISO_FORMAT);
  const lastMonthDay = (n: number) =>
    format(addDays(lastMonthStart, n), DATE_ISO_FORMAT);

  await db.insert(transactions).values([
    {
      type: "expense",
      amount: 450,
      merchant: "Swiggy",
      category_id: FOOD,
      source_id: UPI,
      date: day(0),
      note: null,
    },
    {
      type: "expense",
      amount: 1200,
      merchant: "Uber",
      category_id: TRANSPORT,
      source_id: UPI,
      date: day(0),
      note: null,
    },
    {
      type: "expense",
      amount: 120,
      merchant: "Chai Point",
      category_id: FOOD,
      source_id: UPI,
      date: day(0),
      note: null,
    },
    {
      type: "expense",
      amount: 2800,
      merchant: "DMart",
      category_id: SHOPPING,
      source_id: CASH,
      date: day(1),
      note: null,
    },
    {
      type: "income",
      amount: 85000,
      merchant: "Salary",
      category_id: SALARY,
      source_id: null,
      date: day(1),
      note: "March salary",
    },
    {
      type: "expense",
      amount: 250,
      merchant: "Auto",
      category_id: TRANSPORT,
      source_id: CASH,
      date: day(1),
      note: null,
    },
    {
      type: "expense",
      amount: 649,
      merchant: "Netflix",
      category_id: ENTERTAINMENT,
      source_id: CREDIT,
      date: day(2),
      note: null,
    },
    {
      type: "expense",
      amount: 350,
      merchant: "Starbucks",
      category_id: FOOD,
      source_id: UPI,
      date: day(2),
      note: null,
    },
    {
      type: "expense",
      amount: 199,
      merchant: "Spotify",
      category_id: ENTERTAINMENT,
      source_id: CREDIT,
      date: day(2),
      note: null,
    },
    {
      type: "expense",
      amount: 1800,
      merchant: "Electricity",
      category_id: UTILITIES,
      source_id: UPI,
      date: day(3),
      note: "March bill",
    },
    {
      type: "expense",
      amount: 500,
      merchant: "Zomato",
      category_id: FOOD,
      source_id: UPI,
      date: day(3),
      note: null,
    },
    {
      type: "expense",
      amount: 150,
      merchant: "Tea Trails",
      category_id: FOOD,
      source_id: CASH,
      date: day(3),
      note: null,
    },
    {
      type: "income",
      amount: 15000,
      merchant: "Freelance gig",
      category_id: OTHER_INCOME,
      source_id: null,
      date: day(4),
      note: "Logo design",
    },
    {
      type: "expense",
      amount: 3200,
      merchant: "Amazon",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: day(5),
      note: "Headphones",
    },
    {
      type: "expense",
      amount: 800,
      merchant: "Flipkart",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: day(5),
      note: "Phone case",
    },
    {
      type: "expense",
      amount: 1500,
      merchant: "Gym",
      category_id: HEALTH,
      source_id: UPI,
      date: day(6),
      note: "Monthly fee",
    },
    {
      type: "expense",
      amount: 400,
      merchant: "Pharmacy",
      category_id: HEALTH,
      source_id: CASH,
      date: day(6),
      note: null,
    },
    {
      type: "expense",
      amount: 2200,
      merchant: "Myntra",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: day(7),
      note: "Shoes",
    },
    {
      type: "expense",
      amount: 180,
      merchant: "Metro",
      category_id: TRANSPORT,
      source_id: UPI,
      date: day(7),
      note: null,
    },
    {
      type: "income",
      amount: 5000,
      merchant: "Refund",
      category_id: REFUNDS,
      source_id: null,
      date: day(7),
      note: "Amazon refund",
    },
    {
      type: "expense",
      amount: 950,
      merchant: "BigBasket",
      category_id: FOOD,
      source_id: UPI,
      date: day(8),
      note: null,
    },
    {
      type: "expense",
      amount: 1200,
      merchant: "Ola",
      category_id: TRANSPORT,
      source_id: UPI,
      date: day(8),
      note: null,
    },
    {
      type: "expense",
      amount: 350,
      merchant: "McDonald",
      category_id: FOOD,
      source_id: CASH,
      date: day(9),
      note: null,
    },
    {
      type: "expense",
      amount: 2500,
      merchant: "Croma",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: day(9),
      note: "USB cable",
    },
    {
      type: "expense",
      amount: 600,
      merchant: "Dominos",
      category_id: FOOD,
      source_id: UPI,
      date: day(10),
      note: null,
    },
    {
      type: "expense",
      amount: 1100,
      merchant: "Gas Bill",
      category_id: UTILITIES,
      source_id: UPI,
      date: day(10),
      note: null,
    },
    {
      type: "income",
      amount: 8000,
      merchant: "Side project",
      category_id: OTHER_INCOME,
      source_id: null,
      date: day(11),
      note: "Website fix",
    },
    {
      type: "expense",
      amount: 450,
      merchant: "Rapido",
      category_id: TRANSPORT,
      source_id: UPI,
      date: day(12),
      note: null,
    },
    {
      type: "expense",
      amount: 3500,
      merchant: "Water purifier",
      category_id: UTILITIES,
      source_id: CREDIT,
      date: day(13),
      note: "AMC renewal",
    },
    {
      type: "expense",
      amount: 280,
      merchant: "Dunzo",
      category_id: FOOD,
      source_id: UPI,
      date: day(14),
      note: null,
    },
    {
      type: "income",
      amount: 80000,
      merchant: "Salary",
      category_id: SALARY,
      source_id: null,
      date: lastMonthDay(1),
      note: "Feb salary",
    },
    {
      type: "expense",
      amount: 3200,
      merchant: "Swiggy",
      category_id: FOOD,
      source_id: UPI,
      date: lastMonthDay(2),
      note: null,
    },
    {
      type: "expense",
      amount: 1800,
      merchant: "Uber",
      category_id: TRANSPORT,
      source_id: UPI,
      date: lastMonthDay(3),
      note: null,
    },
    {
      type: "expense",
      amount: 4500,
      merchant: "Amazon",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: lastMonthDay(5),
      note: "Backpack",
    },
    {
      type: "expense",
      amount: 649,
      merchant: "Netflix",
      category_id: ENTERTAINMENT,
      source_id: CREDIT,
      date: lastMonthDay(6),
      note: null,
    },
    {
      type: "expense",
      amount: 1800,
      merchant: "Electricity",
      category_id: UTILITIES,
      source_id: UPI,
      date: lastMonthDay(8),
      note: "Feb bill",
    },
    {
      type: "expense",
      amount: 2500,
      merchant: "DMart",
      category_id: SHOPPING,
      source_id: CASH,
      date: lastMonthDay(10),
      note: null,
    },
    {
      type: "expense",
      amount: 1500,
      merchant: "Gym",
      category_id: HEALTH,
      source_id: UPI,
      date: lastMonthDay(12),
      note: "Monthly fee",
    },
    {
      type: "expense",
      amount: 950,
      merchant: "BigBasket",
      category_id: FOOD,
      source_id: UPI,
      date: lastMonthDay(15),
      note: null,
    },
    {
      type: "expense",
      amount: 1200,
      merchant: "Ola",
      category_id: TRANSPORT,
      source_id: UPI,
      date: lastMonthDay(18),
      note: null,
    },
    {
      type: "expense",
      amount: 199,
      merchant: "Spotify",
      category_id: ENTERTAINMENT,
      source_id: CREDIT,
      date: lastMonthDay(20),
      note: null,
    },
    {
      type: "expense",
      amount: 3500,
      merchant: "Croma",
      category_id: SHOPPING,
      source_id: CREDIT,
      date: lastMonthDay(22),
      note: "Charger",
    },
  ]);

  await db.insert(tags).values([
    { name: "Dining Out", sort_order: 0 },
    { name: "Groceries", sort_order: 1 },
    { name: "Travel", sort_order: 2 },
    { name: "Subscriptions", sort_order: 3 },
    { name: "Work", sort_order: 4 },
  ]);

  const tagRows = await db.select().from(tags);
  const tagId = (name: string) =>
    tagRows.find((t) => t.name === name)?.id ?? null;

  const DINING = tagId("Dining Out");
  const GROCERIES = tagId("Groceries");
  const TRAVEL = tagId("Travel");
  const SUBSCRIPTIONS = tagId("Subscriptions");
  const WORK = tagId("Work");

  const diningMerchants = new Set([
    "Swiggy",
    "Zomato",
    "Dominos",
    "Chai Point",
    "Starbucks",
    "McDonald",
    "Tea Trails",
    "Dunzo",
  ]);
  const groceryMerchants = new Set(["DMart", "BigBasket"]);
  const travelMerchants = new Set(["Uber", "Ola", "Rapido", "Metro", "Auto"]);
  const subscriptionMerchants = new Set(["Netflix", "Spotify"]);
  const workMerchants = new Set(["Freelance gig", "Side project"]);

  const txnRows = await db.select().from(transactions);
  const links: { transaction_id: number; tag_id: number }[] = [];
  for (const t of txnRows) {
    const m = t.merchant ?? "";
    if (DINING && diningMerchants.has(m))
      links.push({ transaction_id: t.id, tag_id: DINING });
    if (GROCERIES && groceryMerchants.has(m))
      links.push({ transaction_id: t.id, tag_id: GROCERIES });
    if (TRAVEL && travelMerchants.has(m))
      links.push({ transaction_id: t.id, tag_id: TRAVEL });
    if (SUBSCRIPTIONS && subscriptionMerchants.has(m))
      links.push({ transaction_id: t.id, tag_id: SUBSCRIPTIONS });
    if (WORK && workMerchants.has(m))
      links.push({ transaction_id: t.id, tag_id: WORK });
  }
  if (links.length > 0) {
    await db.insert(transactionTags).values(links);
  }

  return true;
}

const destinationSources = aliasedTable(sources, "destination_sources");

function transactionSelect() {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      merchant: transactions.merchant,
      category_id: transactions.category_id,
      source_id: transactions.source_id,
      destination_source_id: transactions.destination_source_id,
      subscription_id: transactions.subscription_id,
      source_type: transactions.source_type,
      parsed_by: transactions.parsed_by,
      reimbursement_status: transactions.reimbursement_status,
      reimbursed_at: transactions.reimbursed_at,
      date: transactions.date,
      note: transactions.note,
      created_at: transactions.created_at,
      category_name: categories.name,
      source_name: sources.name,
      destination_source_name: destinationSources.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.category_id, categories.id))
    .leftJoin(sources, eq(transactions.source_id, sources.id))
    .leftJoin(
      destinationSources,
      eq(transactions.destination_source_id, destinationSources.id),
    );
}

async function attachTagsToRows(
  rows: Omit<TransactionRow, "tags">[],
): Promise<TransactionRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tagMap = await getTagsForTransactions(ids);
  return rows.map((row) => ({
    ...row,
    tags: tagMap.get(row.id) ?? [],
  })) as TransactionRow[];
}

export async function getRecentTransactions(limit = 20) {
  try {
    const rows = (await transactionSelect()
      .orderBy(desc(transactions.date), desc(transactions.created_at))
      .limit(limit)) as Omit<TransactionRow, "tags">[];
    return attachTagsToRows(rows);
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getRecentTransactions",
    });
    throw error;
  }
}

export async function getMonthTransactions(yearMonth: string, limit = 10) {
  try {
    const rows = (await transactionSelect()
      .where(sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`)
      .orderBy(desc(transactions.date), desc(transactions.created_at))
      .limit(limit)) as Omit<TransactionRow, "tags">[];
    return attachTagsToRows(rows);
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getMonthTransactions",
    });
    throw error;
  }
}

export async function getMonthlySummary(yearMonth: string) {
  try {
    const result = await db
      .select({
        total_income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        total_expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
          sql`${transactions.type} != 'transfer'`,
        ),
      );
    return result[0] as MonthlySummary;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getMonthlySummary",
    });
    throw error;
  }
}

export async function getTransactionsPaginated(
  limit = 10,
  offset = 0,
  filters?: {
    type?: "income" | "expense" | "transfer" | "all";
    categoryId?: number | null;
    sourceId?: number | null;
    sourceType?: SourceType | "all";
    dateFrom?: string | null;
    dateTo?: string | null;
    amountMin?: number | null;
    amountMax?: number | null;
    search?: string;
    reimbursement?: "all" | "pending" | "reimbursed";
    tagIds?: number[] | null;
  },
) {
  try {
    const conditions = [];

    if (filters?.type && filters.type !== "all") {
      conditions.push(eq(transactions.type, filters.type));
    }
    if (filters?.categoryId) {
      const [cat] = await db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.id, filters.categoryId))
        .limit(1);
      if (cat?.name.toLowerCase() === "other") {
        const match = or(
          eq(transactions.category_id, filters.categoryId),
          isNull(transactions.category_id),
        );
        if (match) conditions.push(match);
      } else {
        conditions.push(eq(transactions.category_id, filters.categoryId));
      }
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
    if (filters?.amountMin != null) {
      conditions.push(gte(transactions.amount, filters.amountMin));
    }
    if (filters?.amountMax != null) {
      conditions.push(lte(transactions.amount, filters.amountMax));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          like(transactions.merchant, term),
          like(transactions.note, term),
          like(sql`CAST(${transactions.amount} AS TEXT)`, term),
        ),
      );
    }
    if (filters?.reimbursement && filters.reimbursement !== "all") {
      conditions.push(
        eq(transactions.reimbursement_status, filters.reimbursement),
      );
    }
    if (filters?.tagIds && filters.tagIds.length > 0) {
      const ids = filters.tagIds;
      conditions.push(
        inArray(
          transactions.id,
          db
            .select({ id: transactionTags.transaction_id })
            .from(transactionTags)
            .where(inArray(transactionTags.tag_id, ids))
            .groupBy(transactionTags.transaction_id)
            .having(
              sql`COUNT(DISTINCT ${transactionTags.tag_id}) = ${ids.length}`,
            ),
        ),
      );
    }

    const query = transactionSelect()
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.created_at))
      .limit(limit)
      .offset(offset);

    const rows = (await query) as Omit<TransactionRow, "tags">[];
    return attachTagsToRows(rows);
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getTransactionsPaginated",
    });
    throw error;
  }
}

export async function getAllTransactionsFiltered(
  filters?: Parameters<typeof getTransactionsPaginated>[2],
) {
  return getTransactionsPaginated(MAX_EXPORT_TRANSACTIONS, 0, filters);
}

export async function getTransactionById(id: number) {
  try {
    const result = (await transactionSelect().where(
      eq(transactions.id, id),
    )) as Omit<TransactionRow, "tags">[];
    if (!result[0]) return null;
    const [row] = await attachTagsToRows([result[0]]);
    return row as TransactionRow;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getTransactionById",
    });
    throw error;
  }
}

export async function insertTransaction(params: {
  type: "income" | "expense" | "transfer";
  amount: number;
  merchant: string | null;
  categoryId: number | null;
  sourceId: number | null;
  destinationSourceId?: number | null;
  subscriptionId?: number | null;
  sourceType?: SourceType;
  parsedBy?: ParsedByType;
  reimbursementStatus?: "none" | "pending" | "reimbursed";
  date: string;
  note: string | null;
  tagIds?: number[];
}) {
  try {
    const validation = transactionInputSchema.safeParse(params);
    if (!validation.success) {
      throw new Error(
        `Invalid transaction data: ${validation.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    const validated = validation.data;

    const result = await db.insert(transactions).values({
      type: validated.type,
      amount: validated.amount,
      merchant: validated.merchant ?? null,
      category_id: validated.categoryId ?? null,
      source_id: validated.sourceId ?? null,
      destination_source_id: validated.destinationSourceId ?? null,
      subscription_id: validated.subscriptionId ?? null,
      source_type: validated.sourceType,
      parsed_by: validated.parsedBy ?? null,
      reimbursement_status: validated.reimbursementStatus,
      date: validated.date,
      note: validated.note ?? null,
    });
    const insertedId = Number(result.lastInsertRowId);
    if (!Number.isFinite(insertedId) || insertedId <= 0) {
      throw new Error("Failed to insert transaction: invalid insertedId");
    }
    if (validated.tagIds && validated.tagIds.length > 0) {
      const unique = Array.from(new Set(validated.tagIds));
      await db.insert(transactionTags).values(
        unique.map((tag_id) => ({
          transaction_id: insertedId,
          tag_id,
        })),
      );
    }
    return result;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "insertTransaction",
    });
    throw error;
  }
}

export async function updateTransaction(
  id: number,
  params: {
    type: "income" | "expense" | "transfer";
    amount: number;
    merchant: string | null;
    categoryId: number | null;
    sourceId: number | null;
    destinationSourceId?: number | null;
    sourceType?: SourceType;
    reimbursementStatus?: "none" | "pending" | "reimbursed";
    date: string;
    note: string | null;
    tagIds?: number[];
  },
) {
  try {
    const validation = transactionInputSchema.safeParse(params);
    if (!validation.success) {
      throw new Error(
        `Invalid transaction data: ${validation.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    // Only touch source_type when the caller explicitly provides it — otherwise
    // editing a Gmail-synced or subscription-generated transaction would wipe
    // its provenance marker and re-import on the next Gmail sync.
    const updates: {
      type: "income" | "expense" | "transfer";
      amount: number;
      merchant: string | null;
      category_id: number | null;
      source_id: number | null;
      destination_source_id: number | null;
      date: string;
      note: string | null;
      source_type?: SourceType;
      reimbursement_status?: "none" | "pending" | "reimbursed";
      reimbursed_at?: string | null;
    } = {
      type: params.type,
      amount: params.amount,
      merchant: params.merchant,
      category_id: params.categoryId,
      source_id: params.sourceId,
      destination_source_id: params.destinationSourceId ?? null,
      date: params.date,
      note: params.note,
    };
    if (params.reimbursementStatus !== undefined) {
      updates.reimbursement_status = params.reimbursementStatus;
      updates.reimbursed_at =
        params.reimbursementStatus === "reimbursed"
          ? new Date().toISOString()
          : null;
    }
    if (params.sourceType !== undefined) {
      const existing = await db
        .select({ source_type: transactions.source_type })
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);
      const current = existing[0]?.source_type ?? "manual";
      const next = params.sourceType;
      const editable = (v: SourceType) => v === "manual" || v === "transfer";
      if (editable(current) && editable(next)) {
        updates.source_type = next;
      }
    }
    const result = await db
      .update(transactions)
      .set(updates)
      .where(eq(transactions.id, id));

    if (params.tagIds !== undefined) {
      await db
        .delete(transactionTags)
        .where(eq(transactionTags.transaction_id, id));
      if (params.tagIds.length > 0) {
        const unique = Array.from(new Set(params.tagIds));
        await db.insert(transactionTags).values(
          unique.map((tag_id) => ({
            transaction_id: id,
            tag_id,
          })),
        );
      }
    }

    return result;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "updateTransaction",
    });
    throw error;
  }
}

export async function deleteTransaction(id: number) {
  try {
    return await db.delete(transactions).where(eq(transactions.id, id));
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "deleteTransaction",
    });
    throw error;
  }
}

export async function restoreTransaction(row: {
  type: "income" | "expense" | "transfer";
  amount: number;
  merchant: string | null;
  category_id: number | null;
  source_id: number | null;
  destination_source_id: number | null;
  reimbursement_status?: "none" | "pending" | "reimbursed";
  reimbursed_at?: string | null;
  date: string;
  note: string | null;
  created_at: string | null;
}) {
  try {
    return await db.insert(transactions).values({
      type: row.type,
      amount: row.amount,
      merchant: row.merchant,
      category_id: row.category_id,
      source_id: row.source_id,
      destination_source_id: row.destination_source_id,
      reimbursement_status: row.reimbursement_status ?? "none",
      reimbursed_at: row.reimbursed_at ?? null,
      date: row.date,
      created_at: row.created_at,
      note: row.note,
    });
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "restoreTransaction",
    });
    throw error;
  }
}

export async function clearAllTransactions() {
  try {
    return await db.delete(transactions);
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "clearAllTransactions",
    });
    throw error;
  }
}

export async function setReimbursementStatus(
  id: number,
  status: "none" | "pending" | "reimbursed",
) {
  try {
    return await db
      .update(transactions)
      .set({
        reimbursement_status: status,
        reimbursed_at:
          status === "reimbursed" ? new Date().toISOString() : null,
      })
      .where(eq(transactions.id, id));
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "setReimbursementStatus",
    });
    throw error;
  }
}

export async function getReimbursementSummary() {
  try {
    const rows = await db
      .select({
        status: transactions.reimbursement_status,
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(sql`${transactions.reimbursement_status} != 'none'`)
      .groupBy(transactions.reimbursement_status);

    const pending = rows.find((r) => r.status === "pending");
    const reimbursed = rows.find((r) => r.status === "reimbursed");

    return {
      pending_count: pending?.count ?? 0,
      pending_total: pending?.total ?? 0,
      reimbursed_count: reimbursed?.count ?? 0,
      reimbursed_total: reimbursed?.total ?? 0,
    };
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getReimbursementSummary",
    });
    throw error;
  }
}

export async function getCategoryBreakdown(yearMonth: string) {
  try {
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
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
        ),
      )
      .groupBy(transactions.category_id)
      .orderBy(sql`SUM(${transactions.amount}) DESC`);

    const otherIndex = rows.findIndex(
      (r) =>
        r.category_id !== null && r.category_name?.toLowerCase() === "other",
    );
    const nullIndex = rows.findIndex((r) => r.category_id === null);

    if (otherIndex !== -1 && nullIndex !== -1) {
      rows[otherIndex] = {
        ...rows[otherIndex],
        total: rows[otherIndex].total + rows[nullIndex].total,
      };
      rows.splice(nullIndex, 1);
    }

    rows.sort((a, b) => b.total - a.total);
    const top = rows.slice(0, 5);
    const grandTotal = top.reduce((sum, r) => sum + r.total, 0);

    return top.map((r) => ({
      category_id: r.category_id,
      category_name: r.category_name ?? OTHER_CATEGORY_LABEL,
      total: r.total,
      percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
    })) as CategoryBreakdownRow[];
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getCategoryBreakdown",
    });
    throw error;
  }
}

export async function syncedTransactionExists(
  date: string,
  amount: number,
): Promise<boolean> {
  try {
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
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "syncedTransactionExists",
    });
    throw error;
  }
}

export async function getMostUsedCategoryForMerchant(
  merchant: string,
  type: "expense" | "income",
): Promise<number | null> {
  try {
    const rows = await db
      .select({
        category_id: transactions.category_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          sql`LOWER(${transactions.merchant}) = LOWER(${merchant})`,
          eq(transactions.type, type),
          sql`${transactions.category_id} IS NOT NULL`,
        ),
      )
      .groupBy(transactions.category_id)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(1);

    return rows[0]?.category_id ?? null;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getMostUsedCategoryForMerchant",
    });
    throw error;
  }
}

export async function findDuplicateTransaction(
  date: string,
  amount: number,
  merchant: string,
): Promise<boolean> {
  try {
    const target = new Date(date);
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(target.getTime() - day).toISOString().slice(0, 10);
    const to = new Date(target.getTime() + day).toISOString().slice(0, 10);
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          sql`substr(${transactions.date}, 1, 10) >= ${from}`,
          sql`substr(${transactions.date}, 1, 10) <= ${to}`,
          eq(transactions.amount, amount),
          sql`LOWER(${transactions.merchant}) = ${merchant.toLowerCase()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "findDuplicateTransaction",
    });
    throw error;
  }
}

export async function getMonthlyInsights(
  year: number,
  month: number,
): Promise<MonthlyInsights> {
  try {
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const prevDate = subMonths(new Date(year, month - 1, 1), 1);
    const prevYearMonth = format(prevDate, MONTH_FORMAT);

    const monthDate = new Date(year, month - 1, 1);
    const daysInMonth = getDaysInMonth(monthDate);
    const today = new Date();
    const daysElapsed = Math.max(1, differenceInDays(today, monthDate) + 1);

    const [thisMonthCategories, prevMonthCategories, currentSpendResult] =
      await Promise.all([
        db
          .select({
            category_id: transactions.category_id,
            category_name: categories.name,
            total: sql<number>`SUM(${transactions.amount})`,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.category_id, categories.id))
          .where(
            and(
              eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
              sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
            ),
          )
          .groupBy(transactions.category_id)
          .orderBy(sql`SUM(${transactions.amount}) DESC`)
          .limit(1),

        db
          .select({
            category_id: transactions.category_id,
            total: sql<number>`SUM(${transactions.amount})`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
              sql`strftime('%Y-%m', ${transactions.date}) = ${prevYearMonth}`,
            ),
          )
          .groupBy(transactions.category_id),

        db
          .select({
            total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
              sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
            ),
          ),
      ]);

    let topCategoryChange: MonthlyInsights["topCategoryChange"] = null;
    if (thisMonthCategories.length > 0) {
      const top = thisMonthCategories[0];
      const prevMatch = prevMonthCategories.find(
        (p) => p.category_id === top.category_id,
      );
      if (prevMatch && prevMatch.total > 0) {
        const change = ((top.total - prevMatch.total) / prevMatch.total) * 100;
        topCategoryChange = {
          category: top.category_name ?? OTHER_CATEGORY_LABEL,
          categoryId: top.category_id,
          percent: Math.abs(Math.round(change)),
          direction: change >= 0 ? "up" : "down",
        };
      }
    }

    const currentSpend = currentSpendResult[0]?.total ?? 0;
    const remainingDays = daysInMonth - daysElapsed;
    const dailyRate = daysElapsed > 0 ? currentSpend / daysElapsed : 0;
    // Clamp projections to >= 0: if refunds/income make currentSpend or
    // dailyRate negative, the UI would otherwise render a negative forecast
    // which confuses users and breaks progress-bar math in the widget.
    const projectedLow =
      daysElapsed >= 7
        ? Math.max(0, currentSpend + dailyRate * remainingDays * 0.8)
        : null;
    const projectedHigh =
      daysElapsed >= 7
        ? Math.max(0, currentSpend + dailyRate * remainingDays * 1.2)
        : null;

    return {
      topCategoryChange,
      projectedLow,
      projectedHigh,
      daysElapsed,
      daysInMonth,
    };
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getMonthlyInsights",
    });
    throw error;
  }
}

export {
  addBank,
  addBankEmail,
  deleteBank,
  deleteBankEmail,
  getActiveBanksWithEmails,
  getAllBanksWithEmails,
  setBankActive,
} from "./banks";
export {
  addCategory,
  deleteCategory,
  getAllCategories,
  getCategoriesByType,
  updateCategoryOrder,
} from "./categories";
export {
  addSource,
  deleteSource,
  getAllSources,
  updateSourceOrder,
} from "./sources";
export { getDataStats } from "./stats";
export {
  addTag,
  deleteTag,
  getAllTags,
  getAllTimeTagBreakdown,
  getTagBreakdown,
  getTagsForTransaction,
  getTagsForTransactions,
  getTransactionIdsForTags,
  renameTag,
  setTransactionTags,
  updateTagOrder,
} from "./tags";

export async function getTodaySpend(): Promise<number> {
  try {
    const today = format(new Date(), DATE_ISO_FORMAT);
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          sql`strftime('%Y-%m-%d', ${transactions.date}) = ${today}`,
        ),
      );
    return result[0]?.total ?? 0;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getTodaySpend",
    });
    throw error;
  }
}

export async function getPreviousMonthSpendAtDay(
  daysElapsed: number,
): Promise<number | null> {
  try {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = format(prev, MONTH_FORMAT);
    const prevDaysInMonth = new Date(
      prev.getFullYear(),
      prev.getMonth() + 1,
      0,
    ).getDate();
    const cutoffDay = Math.min(daysElapsed, prevDaysInMonth);
    const cutoff = `${prevYearMonth}-${String(cutoffDay).padStart(2, "0")}`;
    const start = `${prevYearMonth}-01`;

    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          sql`${transactions.date} >= ${start}`,
          sql`strftime('%Y-%m-%d', ${transactions.date}) <= ${cutoff}`,
        ),
      );
    const total = result[0]?.total ?? 0;
    return total > 0 ? total : null;
  } catch (error) {
    logFirebaseError(error, {
      error_type: "DB_ERROR",
      operation: "getPreviousMonthSpendAtDay",
    });
    throw error;
  }
}

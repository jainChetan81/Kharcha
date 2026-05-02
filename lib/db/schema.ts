import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// --- Tables ---

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] })
    .notNull()
    .default("expense"),
  is_default: integer("is_default").default(0),
  sort_order: integer("sort_order").default(0),
});

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  is_default: integer("is_default").default(0),
  sort_order: integer("sort_order").default(0),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  billing_day: integer("billing_day").notNull(),
  billing_days: text("billing_days").notNull().default("[]"),
  category_id: integer("category_id").references(() => categories.id),
  source_id: integer("source_id").references(() => sources.id),
  type: text("type", { enum: ["expense", "investment"] })
    .notNull()
    .default("expense"),
  holding_id: integer("holding_id").references(() => holdings.id),
  investment_kind: text("investment_kind", {
    enum: ["buy", "sell", "dividend", "interest"],
  }),
  default_units: real("default_units"),
  is_active: integer("is_active").default(1),
  created_at: text("created_at").default("(datetime('now'))"),
});

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  instrument_type: text("instrument_type", {
    enum: [
      "stock",
      "mutual_fund",
      "etf",
      "fd",
      "ppf",
      "gold",
      "crypto",
      "bond",
      "other",
    ],
  })
    .notNull()
    .default("mutual_fund"),
  units: real("units").notNull().default(0),
  avg_cost: real("avg_cost").notNull().default(0),
  invested: real("invested").notNull().default(0),
  note: text("note"),
  is_closed: integer("is_closed").default(0),
  sort_order: integer("sort_order").default(0),
  created_at: text("created_at").default("(datetime('now'))"),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", {
    enum: ["income", "expense", "transfer", "investment"],
  })
    .notNull()
    .default("expense"),
  amount: real("amount").notNull(),
  merchant: text("merchant"),
  category_id: integer("category_id").references(() => categories.id),
  source_id: integer("source_id").references(() => sources.id),
  destination_source_id: integer("destination_source_id").references(
    () => sources.id,
  ),
  subscription_id: integer("subscription_id").references(
    () => subscriptions.id,
  ),
  holding_id: integer("holding_id").references(() => holdings.id),
  investment_kind: text("investment_kind", {
    enum: ["buy", "sell", "dividend", "interest"],
  }),
  units: real("units"),
  source_type: text("source_type", {
    enum: ["manual", "synced", "recurring", "transfer"],
  })
    .notNull()
    .default("manual"),
  gmail_message_id: text("gmail_message_id"),
  parsed_by: text("parsed_by", { enum: ["regex", "gemini"] }),
  reimbursement_status: text("reimbursement_status", {
    enum: ["none", "pending", "reimbursed"],
  })
    .notNull()
    .default("none"),
  reimbursable_amount: real("reimbursable_amount"),
  reimbursed_at: text("reimbursed_at"),
  date: text("date").notNull(),
  note: text("note"),
  created_at: text("created_at").default("(datetime('now'))"),
});

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category_id: integer("category_id")
    .references(() => categories.id)
    .unique(),
  amount: real("amount").notNull(),
});

export const banks = sqliteTable("banks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  parser_key: text("parser_key"),
  is_default: integer("is_default").default(0),
  is_active: integer("is_active").default(1),
});

export const bankEmails = sqliteTable("bank_emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bank_id: integer("bank_id")
    .references(() => banks.id)
    .notNull(),
  email: text("email").notNull(),
  is_default: integer("is_default").default(0),
});

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sort_order: integer("sort_order").default(0),
  start_date: text("start_date"),
  end_date: text("end_date"),
  /** Hex with leading `#`, picked from TAG_COLOR_PALETTE. Null = no tint. */
  color: text("color"),
  /** Single grapheme — e.g. "✈️", "🍔". Null = no emoji prefix. */
  emoji: text("emoji"),
  created_at: text("created_at").default("(datetime('now'))"),
});

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transaction_id: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.transaction_id, table.tag_id] }),
  }),
);

export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Substring matched case-insensitively against transaction.merchant. */
  merchant_pattern: text("merchant_pattern").notNull(),
  category_id: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  created_at: text("created_at").default("(datetime('now'))"),
  updated_at: text("updated_at").default("(datetime('now'))"),
});

export const categoryRuleTags = sqliteTable(
  "category_rule_tags",
  {
    rule_id: integer("rule_id")
      .notNull()
      .references(() => categoryRules.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.rule_id, table.tag_id] }),
  }),
);

// Inferred types are exported from ./types.ts

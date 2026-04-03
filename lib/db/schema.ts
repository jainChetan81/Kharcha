import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// --- Tables ---

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["income", "expense"] })
    .notNull()
    .default("expense"),
  is_default: integer("is_default").default(0),
});

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  is_default: integer("is_default").default(0),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  billing_day: integer("billing_day").notNull(),
  category_id: integer("category_id").references(() => categories.id),
  source_id: integer("source_id").references(() => sources.id),
  is_active: integer("is_active").default(1),
  created_at: text("created_at").default("(datetime('now'))"),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["income", "expense"] })
    .notNull()
    .default("expense"),
  amount: real("amount").notNull(),
  merchant: text("merchant"),
  category_id: integer("category_id").references(() => categories.id),
  source_id: integer("source_id").references(() => sources.id),
  subscription_id: integer("subscription_id").references(
    () => subscriptions.id,
  ),
  source_type: text("source_type", {
    enum: ["manual", "synced", "recurring"],
  })
    .notNull()
    .default("manual"),
  gmail_message_id: text("gmail_message_id"),
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

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Inferred types are exported from ./types.ts

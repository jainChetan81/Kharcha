import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["income", "expense"] })
    .notNull()
    .default("expense"),
  amount: real("amount").notNull(),
  merchant: text("merchant"),
  category_id: integer("category_id").references(() => categories.id),
  source_id: integer("source_id").references(() => sources.id),
  date: text("date").notNull(),
  note: text("note"),
  created_at: text("created_at").default("(datetime('now'))"),
});

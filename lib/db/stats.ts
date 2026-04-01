import { count, min } from "drizzle-orm";
import { db } from "./connection";
import { categories, sources, transactions } from "./schema";

export async function getDataStats() {
  const [[txCount], [catCount], [srcCount], [firstDate]] = await Promise.all([
    db.select({ value: count() }).from(transactions),
    db.select({ value: count() }).from(categories),
    db.select({ value: count() }).from(sources),
    db.select({ value: min(transactions.date) }).from(transactions),
  ]);

  return {
    total_transactions: txCount?.value ?? 0,
    total_categories: catCount?.value ?? 0,
    total_sources: srcCount?.value ?? 0,
    first_transaction_date: firstDate?.value ?? null,
  };
}

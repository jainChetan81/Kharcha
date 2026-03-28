import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgets, categories, transactions } from "./schema";

export type BudgetRow = {
  category_id: number;
  category_name: string;
  amount: number;
};

export async function getBudgets(): Promise<BudgetRow[]> {
  const rows = await db
    .select({
      category_id: budgets.category_id,
      category_name: categories.name,
      amount: budgets.amount,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.category_id, categories.id));

  return rows.map((r) => ({
    category_id: r.category_id as number,
    category_name: r.category_name ?? "Unknown",
    amount: r.amount,
  }));
}

export async function setBudget(
  categoryId: number,
  amount: number,
): Promise<void> {
  await db
    .insert(budgets)
    .values({ category_id: categoryId, amount })
    .onConflictDoUpdate({
      target: budgets.category_id,
      set: { amount },
    });
}

export async function deleteBudget(categoryId: number): Promise<void> {
  await db.delete(budgets).where(eq(budgets.category_id, categoryId));
}

export async function getBudgetForCategory(
  categoryId: number,
): Promise<number | null> {
  const rows = await db
    .select({ amount: budgets.amount })
    .from(budgets)
    .where(eq(budgets.category_id, categoryId));
  return rows[0]?.amount ?? null;
}

export async function getCategorySpent(
  categoryId: number,
  yearMonth: string,
): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        eq(transactions.category_id, categoryId),
        sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
      ),
    );
  return rows[0]?.total ?? 0;
}

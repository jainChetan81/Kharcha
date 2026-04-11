import { and, asc, eq } from "drizzle-orm";
import { db } from "./connection";
import { budgets, categories, subscriptions, transactions } from "./schema";
import type { Category } from "./types";

export async function getAllCategories(): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.sort_order)) as Promise<Category[]>;
}

export async function getCategoriesByType(
  type: "income" | "expense",
): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.type, type))
    .orderBy(asc(categories.sort_order)) as Promise<Category[]>;
}

export async function updateCategoryOrder(
  items: { id: number; sort_order: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(categories)
        .set({ sort_order: item.sort_order })
        .where(eq(categories.id, item.id));
    }
  });
}

export async function addCategory(name: string, type: "income" | "expense") {
  return db.insert(categories).values({ name, type, is_default: 0 });
}

export async function deleteCategory(id: number) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id));
  if (!existing || existing.is_default === 1) return;

  await db
    .update(transactions)
    .set({ category_id: null })
    .where(eq(transactions.category_id, id));
  await db
    .update(subscriptions)
    .set({ category_id: null })
    .where(eq(subscriptions.category_id, id));
  await db.delete(budgets).where(eq(budgets.category_id, id));
  return db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.is_default, 0)));
}

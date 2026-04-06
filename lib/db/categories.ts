import { and, eq } from "drizzle-orm";
import { db } from "./connection";
import { categories, transactions } from "./schema";
import type { Category } from "./types";

export async function getAllCategories(): Promise<Category[]> {
  return db.select().from(categories) as Promise<Category[]>;
}

export async function getCategoriesByType(
  type: "income" | "expense",
): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.type, type)) as Promise<Category[]>;
}

export async function addCategory(name: string, type: "income" | "expense") {
  return db.insert(categories).values({ name, type, is_default: 0 });
}

export async function deleteCategory(id: number) {
  await db
    .update(transactions)
    .set({ category_id: null })
    .where(eq(transactions.category_id, id));
  return db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.is_default, 0)));
}

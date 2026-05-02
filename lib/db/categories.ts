import { and, asc, eq, inArray, sql } from "drizzle-orm";
import expo, { db } from "./connection";
import {
  budgets,
  categories,
  categoryRules,
  categoryRuleTags,
  subscriptions,
  transactions,
} from "./schema";
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
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.type, type),
        sql`LOWER(${categories.name}) = ${trimmed.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };
  const result = await db
    .insert(categories)
    .values({ name: trimmed, type, is_default: 0 });
  return { id: Number(result.lastInsertRowId), isNew: true };
}

export async function deleteCategory(id: number) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id));
  if (!existing || existing.is_default === 1) return;

  await expo.withTransactionAsync(async () => {
    await db
      .update(transactions)
      .set({ category_id: null })
      .where(eq(transactions.category_id, id));
    await db
      .update(subscriptions)
      .set({ category_id: null })
      .where(eq(subscriptions.category_id, id));
    await db.delete(budgets).where(eq(budgets.category_id, id));
    // Smart Category Rules are tied to one category by design — when that
    // category goes away, drop the rules and their tag links rather than
    // leaving orphaned rows. FK cascade in the schema is decorative
    // because expo-sqlite doesn't enable PRAGMA foreign_keys, so this is
    // the actual enforcement.
    const rulesToDelete = await db
      .select({ id: categoryRules.id })
      .from(categoryRules)
      .where(eq(categoryRules.category_id, id));
    const ruleIds = rulesToDelete.map((r) => r.id);
    if (ruleIds.length > 0) {
      await db
        .delete(categoryRuleTags)
        .where(inArray(categoryRuleTags.rule_id, ruleIds));
      await db.delete(categoryRules).where(inArray(categoryRules.id, ruleIds));
    }
    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.is_default, 0)));
  });
}

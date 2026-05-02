import { desc, eq, sql } from "drizzle-orm";
import { ERROR_TYPE, logFirebaseError } from "@/lib/firebase";
import { db } from "./connection";
import { categories, categoryRules, categoryRuleTags } from "./schema";

/**
 * Find the rule whose `merchant_pattern` is a case-insensitive substring of
 * `merchant`. When multiple rules match, the longest pattern wins (more
 * specific); ties broken by most recently created. Returns null if no rule
 * matches or merchant is empty.
 *
 * `type` filters by the linked category's type so an expense rule never
 * leaks into an income form (and vice versa).
 *
 * No user-facing UI creates rules right now — the feature is wired into
 * categorization paths so that any rules added (manually, via future UI,
 * or by a developer) take effect without further plumbing. The CRUD layer
 * was removed when the management screen was dropped.
 */
export async function findRuleForMerchant(
  merchant: string,
  type: "expense" | "income" = "expense",
): Promise<{ categoryId: number; tagIds: number[] } | null> {
  try {
    const trimmed = merchant.trim().toLowerCase();
    if (!trimmed) return null;

    // SQL-side escape of LIKE wildcards in the stored pattern, since the
    // pattern lives in a column rather than a parameter we could escape in
    // JS. ESCAPE '\' makes \%, \_, \\ literal so a pattern like "100%"
    // matches the exact substring instead of wildcarding.
    const [match] = await db
      .select({
        id: categoryRules.id,
        category_id: categoryRules.category_id,
      })
      .from(categoryRules)
      .innerJoin(categories, eq(categoryRules.category_id, categories.id))
      .where(
        sql`${trimmed} LIKE '%' || REPLACE(REPLACE(REPLACE(LOWER(${categoryRules.merchant_pattern}), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\' AND ${categories.type} = ${type}`,
      )
      .orderBy(
        desc(sql`LENGTH(${categoryRules.merchant_pattern})`),
        desc(categoryRules.created_at),
      )
      .limit(1);

    if (!match) return null;

    const tagRows = await db
      .select({ tag_id: categoryRuleTags.tag_id })
      .from(categoryRuleTags)
      .where(eq(categoryRuleTags.rule_id, match.id));

    return {
      categoryId: match.category_id,
      tagIds: tagRows.map((r) => r.tag_id),
    };
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "findRuleForMerchant",
    });
    return null;
  }
}

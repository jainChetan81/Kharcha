import { getMostUsedCategoryForMerchant } from "@/lib/db";
import { findRuleForMerchant } from "@/lib/db/categoryRules";
import { getMostUsedTagsForMerchant } from "@/lib/db/tags";

export type ResolvedCategoryAndTags = {
  categoryId: number | null;
  tagIds: number[];
  /** Where the resolution came from. Lets callers tailor UI feedback. */
  source: "rule" | "history" | "none";
};

/**
 * Resolve a category (and tags) for a merchant. Smart Category Rules win
 * over the history-inference fallback so explicit user intent always
 * trumps the learned-from-past-spend guess.
 *
 * `type` only narrows the history fallback (income vs expense category
 * pool). Rules carry their own category type via the linked category row.
 */
export async function resolveCategoryAndTags(
  merchant: string,
  type: "expense" | "income" = "expense",
): Promise<ResolvedCategoryAndTags> {
  const trimmed = merchant.trim();
  if (!trimmed) return { categoryId: null, tagIds: [], source: "none" };

  const rule = await findRuleForMerchant(trimmed, type);
  if (rule) {
    return {
      categoryId: rule.categoryId,
      tagIds: rule.tagIds,
      source: "rule",
    };
  }

  const [categoryId, tagSuggestions] = await Promise.all([
    getMostUsedCategoryForMerchant(trimmed, type),
    getMostUsedTagsForMerchant(trimmed, 4),
  ]);

  return {
    categoryId,
    tagIds: tagSuggestions.map((t) => t.id),
    source:
      categoryId !== null || tagSuggestions.length > 0 ? "history" : "none",
  };
}

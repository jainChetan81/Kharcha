import { useState } from "react";
import { InlineAddSheet } from "@/components/ui/inline-add-sheet";
import { useAddCategory } from "@/hooks/use-categories";
import { useAddHolding } from "@/hooks/use-holdings";
import { useAddSource } from "@/hooks/use-sources";
import {
  INLINE_ADD_COPY,
  INSTRUMENT_TYPE,
  TRANSACTION_TYPE,
} from "@/lib/constants";

type CategoryType = "expense" | "income";

/**
 * Bundles the three "create new X inline from a picker" sheets (category,
 * source, holding) into one call site so forms don't re-author the same
 * visibility state / mutation wiring / toast copy three times each. Copy and
 * labels come from INLINE_ADD_COPY so anything user-facing stays in
 * lib/constants.ts.
 */
export function useInlineAdders(params: {
  categoryType?: CategoryType;
  onCategoryAdded?: (id: number) => void;
  onSourceAdded?: (id: number) => void;
  onHoldingAdded?: (id: number) => void;
}) {
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [holdingVisible, setHoldingVisible] = useState(false);

  const addCategoryMutation = useAddCategory();
  const addSourceMutation = useAddSource();
  const addHoldingMutation = useAddHolding();

  const categoryType: CategoryType = params.categoryType ?? "expense";
  const categoryTitle =
    categoryType === TRANSACTION_TYPE.INCOME
      ? INLINE_ADD_COPY.CATEGORY.titleIncome
      : INLINE_ADD_COPY.CATEGORY.titleExpense;

  return {
    openCategory: () => setCategoryVisible(true),
    openSource: () => setSourceVisible(true),
    openHolding: () => setHoldingVisible(true),
    sheets: (
      <>
        <InlineAddSheet
          visible={categoryVisible}
          onClose={() => setCategoryVisible(false)}
          title={categoryTitle}
          placeholder={INLINE_ADD_COPY.CATEGORY.placeholder}
          submitLabel={INLINE_ADD_COPY.CATEGORY.submitLabel}
          mutateAsync={(name) =>
            addCategoryMutation.mutateAsync({ name, type: categoryType })
          }
          onAdded={(id) => params.onCategoryAdded?.(id)}
          addedToast={INLINE_ADD_COPY.CATEGORY.addedToast}
          existingToast={INLINE_ADD_COPY.CATEGORY.existingToast}
          errorTitle={INLINE_ADD_COPY.CATEGORY.errorTitle}
        />
        <InlineAddSheet
          visible={sourceVisible}
          onClose={() => setSourceVisible(false)}
          title={INLINE_ADD_COPY.SOURCE.title}
          placeholder={INLINE_ADD_COPY.SOURCE.placeholder}
          submitLabel={INLINE_ADD_COPY.SOURCE.submitLabel}
          mutateAsync={(name) => addSourceMutation.mutateAsync(name)}
          onAdded={(id) => params.onSourceAdded?.(id)}
          addedToast={INLINE_ADD_COPY.SOURCE.addedToast}
          existingToast={INLINE_ADD_COPY.SOURCE.existingToast}
          errorTitle={INLINE_ADD_COPY.SOURCE.errorTitle}
        />
        <InlineAddSheet
          visible={holdingVisible}
          onClose={() => setHoldingVisible(false)}
          title={INLINE_ADD_COPY.HOLDING.title}
          placeholder={INLINE_ADD_COPY.HOLDING.placeholder}
          submitLabel={INLINE_ADD_COPY.HOLDING.submitLabel}
          mutateAsync={(name) =>
            addHoldingMutation.mutateAsync({
              name,
              instrument_type: INSTRUMENT_TYPE.MUTUAL_FUND,
            })
          }
          onAdded={(id) => params.onHoldingAdded?.(id)}
          addedToast={INLINE_ADD_COPY.HOLDING.addedToast}
          existingToast={INLINE_ADD_COPY.HOLDING.existingToast}
          errorTitle={INLINE_ADD_COPY.HOLDING.errorTitle}
        />
      </>
    ),
  };
}

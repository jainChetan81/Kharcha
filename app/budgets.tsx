import { Trash2 } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";

const SetBudgetSheet = lazy(() => import("@/components/set-budget-sheet"));

import { Icon } from "@/components/ui/icon";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useBudgets, useDeleteBudget, useSetBudget } from "@/hooks/use-budgets";
import { useAllCategories } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { showDeleteConfirm } from "@/lib/alerts";
import { SCROLL_BOTTOM_PADDING, TRANSACTION_TYPE } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function BudgetsScreen() {
  const { format: fmt } = useCurrency();
  const { data: categories = [] } = useAllCategories();
  const { data: budgets = [] } = useBudgets();
  const setBudgetMutation = useSetBudget();
  const deleteBudgetMutation = useDeleteBudget();

  const [selectedCategory, setSelectedCategory] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const expenseCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.EXPENSE,
  );

  const budgetMap = new Map(budgets.map((b) => [b.category_id, b.amount]));

  function openEditor(categoryId: number, categoryName: string) {
    setSelectedCategory({ id: categoryId, name: categoryName });
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Monthly Budgets" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <ScreenDescription>
          Set a monthly ceiling for each expense category. Kharcha warns you
          when spending crosses 75% and again at 90%. Tap a category to set or
          change its limit.
        </ScreenDescription>

        <Text className="mb-2 mt-2 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Expense Categories
        </Text>
        {expenseCategories.map((c) => {
          const budget = budgetMap.get(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => openEditor(c.id, c.name)}
              className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
            >
              <Text className="flex-1 text-sm font-medium text-foreground">
                {c.name}
              </Text>
              <Text
                className={cn(
                  "text-sm",
                  budget ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {budget ? fmt(budget) : "Not set"}
              </Text>
              {budget && (
                <Pressable
                  onPress={() =>
                    showDeleteConfirm(
                      "Remove Budget",
                      `Remove budget for ${c.name}?`,
                      () => deleteBudgetMutation.mutate(c.id),
                    )
                  }
                  className="ml-3"
                >
                  <Icon as={Trash2} className="size-4 text-negative" />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedCategory && (
        <Suspense fallback={null}>
          <ComponentErrorBoundary>
            <SetBudgetSheet
              visible={!!selectedCategory}
              onClose={() => setSelectedCategory(null)}
              categoryName={selectedCategory.name}
              currentAmount={
                budgetMap.has(selectedCategory.id)
                  ? String(budgetMap.get(selectedCategory.id))
                  : ""
              }
              onSave={async (amount) => {
                try {
                  await setBudgetMutation.mutateAsync({
                    categoryId: selectedCategory.id,
                    amount: Number(amount),
                  });
                  setSelectedCategory(null);
                  showSuccessToast("Budget saved");
                } catch (err) {
                  showErrorToast("Failed", err);
                }
              }}
            />
          </ComponentErrorBoundary>
        </Suspense>
      )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

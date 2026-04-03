import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useBudgets, useDeleteBudget, useSetBudget } from "@/hooks/use-budgets";
import { useAllCategories } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { COLORS, TRANSACTION_TYPE } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

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
  const [draftAmount, setDraftAmount] = useState("");

  const expenseCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.EXPENSE,
  );

  const budgetMap = new Map(budgets.map((b) => [b.category_id, b.amount]));

  function openEditor(categoryId: number, categoryName: string) {
    const existing = budgetMap.get(categoryId);
    setSelectedCategory({ id: categoryId, name: categoryName });
    setDraftAmount(existing ? String(existing) : "");
  }

  async function handleSave() {
    if (!selectedCategory || !draftAmount.trim()) return;
    const amount = Number(draftAmount);
    if (amount <= 0) return;
    try {
      await setBudgetMutation.mutateAsync({
        categoryId: selectedCategory.id,
        amount,
      });
      setSelectedCategory(null);
      showSuccessToast("Budget saved");
    } catch (err) {
      showErrorToast("Failed", err);
    }
  }

  async function handleDelete() {
    if (!selectedCategory) return;
    try {
      await deleteBudgetMutation.mutateAsync(selectedCategory.id);
      setSelectedCategory(null);
      showSuccessToast("Budget removed");
    } catch (err) {
      showErrorToast("Failed", err);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Monthly Budgets" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
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
              <Text className="flex-1 text-sm font-medium capitalize text-foreground">
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
            </Pressable>
          );
        })}
      </ScrollView>

      <BottomSheet
        visible={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        avoidKeyboard
      >
        <Text className="mb-4 text-base font-bold capitalize text-foreground">
          Set Budget for {selectedCategory?.name}
        </Text>
        <Input
          placeholder="Amount"
          value={draftAmount}
          onChangeText={setDraftAmount}
          keyboardType="numeric"
          placeholderTextColor={COLORS.MUTED}
          autoFocus
        />
        <Button
          className="mt-4 h-14 rounded-2xl bg-primary"
          onPress={handleSave}
          disabled={!draftAmount.trim() || Number(draftAmount) <= 0}
        >
          <Text className="text-base font-semibold text-primary-foreground">
            Save Budget
          </Text>
        </Button>
        {budgetMap.has(selectedCategory?.id ?? -1) && (
          <Pressable onPress={handleDelete} className="mt-3 items-center py-2">
            <Text className="text-sm font-medium text-negative">
              Remove Budget
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => setSelectedCategory(null)}
          className={cn("mt-1 items-center py-2", isIOS && "mb-4")}
        >
          <Text className="text-sm font-medium text-muted-foreground">
            Cancel
          </Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

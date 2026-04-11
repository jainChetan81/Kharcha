import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useBudgets, useDeleteBudget, useSetBudget } from "@/hooks/use-budgets";
import { useAllCategories } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { TRANSACTION_TYPE } from "@/lib/constants";
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
                  onPress={() => {
                    Alert.alert(
                      "Remove Budget",
                      `Remove budget for ${c.name}?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => deleteBudgetMutation.mutate(c.id),
                        },
                      ],
                    );
                  }}
                  className="ml-3"
                >
                  <Icon as={Trash2} className="size-4 text-negative" />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <BottomSheet
        visible={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        title={`Set Budget for ${selectedCategory?.name}`}
        placeholder="Amount"
        submitLabel="Save Budget"
        defaultValue={
          budgetMap.has(selectedCategory?.id ?? -1)
            ? String(budgetMap.get(selectedCategory?.id ?? -1))
            : ""
        }
        keyboardType="numeric"
        validate={(v) => {
          const num = Number(v);
          return !Number.isNaN(num) && num > 0;
        }}
        onSave={async (amount) => {
          if (!selectedCategory) return;
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
    </View>
  );
}

export const ErrorBoundary = ScreenError;

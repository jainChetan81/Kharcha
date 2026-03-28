import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useBudgets, useDeleteBudget, useSetBudget } from "@/hooks/use-budgets";
import { useAllCategories } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { TOAST_TYPE, TRANSACTION_TYPE } from "@/lib/constants";
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
      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Budget saved" });
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed",
        text2: String(err),
      });
    }
  }

  async function handleDelete() {
    if (!selectedCategory) return;
    try {
      await deleteBudgetMutation.mutateAsync(selectedCategory.id);
      setSelectedCategory(null);
      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Budget removed" });
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed",
        text2: String(err),
      });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">
            Monthly Budgets
          </Text>
        </Pressable>
      </View>

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
                  budget ? "text-foreground" : "text-[#888888]",
                )}
              >
                {budget ? fmt(budget) : "Not set"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal
        visible={!!selectedCategory}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCategory(null)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setSelectedCategory(null)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="rounded-t-2xl bg-card p-6">
            <Text className="mb-4 text-base font-bold capitalize text-foreground">
              Set Budget for {selectedCategory?.name}
            </Text>
            <Input
              placeholder="Amount"
              value={draftAmount}
              onChangeText={setDraftAmount}
              keyboardType="numeric"
              placeholderTextColor="#888888"
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
              <Pressable
                onPress={handleDelete}
                className="mt-3 items-center py-2"
              >
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

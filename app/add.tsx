import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { SubscriptionForm } from "@/components/subscription-form";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useAddSubscription } from "@/hooks/use-subscriptions";
import { useInsertTransaction } from "@/hooks/use-transactions";
import { COLORS, DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { getBudgetForCategory, getCategorySpent } from "@/lib/db/budgets";
import { processSubscriptions } from "@/lib/db/subscriptions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

export default function AddTransaction() {
  const { type: typeParam, mode: modeParam } = useLocalSearchParams<{
    type?: string;
    mode?: string;
  }>();
  const queryClient = useQueryClient();
  const { format: fmt } = useCurrency();
  const insertMutation = useInsertTransaction();
  const addSubMutation = useAddSubscription();

  const [isSubscription, setIsSubscription] = useState(
    modeParam === "subscription",
  );

  const defaultValues: TransactionFormValues = {
    type: TRANSACTION_TYPE.EXPENSE,
    amount: "",
    merchant: "",
    categoryId: null,
    sourceId: null,
    date: format(new Date(), DATE_TIME_FORMAT),
    note: "",
  };

  const oneTimeDefaults: TransactionFormValues = {
    ...defaultValues,
    type:
      typeParam === TRANSACTION_TYPE.INCOME
        ? TRANSACTION_TYPE.INCOME
        : TRANSACTION_TYPE.EXPENSE,
  };

  async function handleTransactionSubmit(value: TransactionFormValues) {
    try {
      await insertMutation.mutateAsync({
        type: value.type,
        amount: Number(value.amount),
        merchant: value.merchant || null,
        categoryId: value.categoryId,
        sourceId:
          value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
        date: value.date,
        note: value.note || null,
      });
      showSuccessToast(
        "Transaction added",
        `${value.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}${fmt(Number(value.amount))}`,
      );

      if (value.type === TRANSACTION_TYPE.EXPENSE && value.categoryId) {
        const budget = await getBudgetForCategory(value.categoryId);
        if (budget) {
          const yearMonth = value.date.slice(0, 7);
          const spent = await getCategorySpent(value.categoryId, yearMonth);
          if (spent >= budget) {
            showErrorToast(`⚠️ ${value.merchant || "Category"} budget exceeded`);
          } else if (spent >= budget * 0.9) {
            showErrorToast(
              `⚠️ Approaching ${value.merchant || "category"} budget`,
            );
          }
        }
      }

      router.back();
    } catch (err) {
      showErrorToast("Failed to save", err);
    }
  }

  async function handleSubscriptionSubmit(value: {
    name: string;
    amount: number;
    billingDay: number;
    categoryId: number | null;
    sourceId: number | null;
  }) {
    try {
      await addSubMutation.mutateAsync(value);
      await processSubscriptions();
      await queryClient.invalidateQueries();
      showSuccessToast(
        "Subscription added",
        `Renews on day ${value.billingDay} every month`,
      );
      router.back();
    } catch (err) {
      showErrorToast("Failed to save", err);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-3",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">
          {isSubscription ? "Add Subscription" : "Add Transaction"}
        </Text>
        <View className="w-14" />
      </View>

      <View className="mx-5 mb-3 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
        <Text className="text-sm font-medium text-foreground">
          Subscription
        </Text>
        <Switch
          value={isSubscription}
          onValueChange={setIsSubscription}
          trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
          thumbColor={COLORS.FOREGROUND}
        />
      </View>

      {isSubscription ? (
        <SubscriptionForm onSubmit={handleSubscriptionSubmit} />
      ) : (
        <TransactionForm
          defaultValues={oneTimeDefaults}
          submitLabel="Add Transaction"
          onSubmit={handleTransactionSubmit}
        />
      )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

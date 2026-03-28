import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import Toast from "react-native-toast-message";
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
import {
  DATE_TIME_FORMAT,
  TOAST_TYPE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { getBudgetForCategory, getCategorySpent } from "@/lib/db/budgets";
import { processSubscriptions } from "@/lib/db/subscriptions";
import { cn, isIOS } from "@/lib/utils";

export default function AddTransaction() {
  const { type: typeParam, mode: modeParam } = useLocalSearchParams<{
    type?: string;
    mode?: string;
  }>();
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
      Toast.show({
        type: TOAST_TYPE.SUCCESS,
        text1: "Transaction added",
        props: { formattedAmount: fmt(Number(value.amount)), type: value.type },
      });

      if (value.type === TRANSACTION_TYPE.EXPENSE && value.categoryId) {
        const budget = await getBudgetForCategory(value.categoryId);
        if (budget) {
          const yearMonth = value.date.slice(0, 7);
          const spent = await getCategorySpent(value.categoryId, yearMonth);
          if (spent >= budget) {
            Toast.show({
              type: TOAST_TYPE.ERROR,
              text1: `⚠️ ${value.merchant || "Category"} budget exceeded`,
            });
          } else if (spent >= budget * 0.9) {
            Toast.show({
              type: TOAST_TYPE.ERROR,
              text1: `⚠️ Approaching ${value.merchant || "category"} budget`,
            });
          }
        }
      }

      router.back();
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed to save",
        text2: String(err),
      });
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
      Toast.show({
        type: TOAST_TYPE.SUCCESS,
        text1: "Subscription added",
        text2: `Renews on day ${value.billingDay} every month`,
      });
      router.back();
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed to save",
        text2: String(err),
      });
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
          trackColor={{ false: "#2a2a2a", true: "#7c3aed" }}
          thumbColor="#f0f0f0"
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

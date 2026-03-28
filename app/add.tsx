import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Text } from "@/components/ui/text";
import {
  DATE_TIME_FORMAT,
  QUERY_KEYS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { insertTransaction } from "@/lib/db";
import { cn, isIOS } from "@/lib/utils";

export default function AddTransaction() {
  const queryClient = useQueryClient();
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();

  const defaultValues: TransactionFormValues = {
    type:
      typeParam === TRANSACTION_TYPE.INCOME
        ? TRANSACTION_TYPE.INCOME
        : TRANSACTION_TYPE.EXPENSE,
    amount: "",
    merchant: "",
    categoryId: null,
    sourceId: null,
    date: format(new Date(), DATE_TIME_FORMAT),
    note: "",
  };

  async function handleSubmit(value: TransactionFormValues) {
    try {
      await insertTransaction({
        type: value.type,
        amount: Number(value.amount),
        merchant: value.merchant || null,
        categoryId: value.categoryId,
        sourceId:
          value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
        date: value.date,
        note: value.note || null,
      });
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS],
      });
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      });
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      });
      Toast.show({
        type: "success",
        text1: "Transaction added",
        props: { amount: value.amount, type: value.type },
      });
      router.back();
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Failed to save",
        text2: String(err),
      });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-5",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">
          Add Transaction
        </Text>
        <View className="w-14" />
      </View>

      <TransactionForm
        defaultValues={defaultValues}
        submitLabel="Add Transaction"
        onSubmit={handleSubmit}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

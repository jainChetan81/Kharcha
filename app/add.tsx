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
import { useCurrency } from "@/hooks/use-currency";
import { useInsertTransaction } from "@/hooks/use-transactions";
import {
  DATE_TIME_FORMAT,
  TOAST_TYPE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

export default function AddTransaction() {
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const { format: fmt } = useCurrency();
  const insertMutation = useInsertTransaction();

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

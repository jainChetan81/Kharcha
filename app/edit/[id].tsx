import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Text } from "@/components/ui/text";
import {
  useTransactionById,
  useUpdateTransaction,
} from "@/hooks/use-transactions";
import { TOAST_TYPE, TRANSACTION_TYPE } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const updateMutation = useUpdateTransaction(transactionId);

  const { data: transaction, isLoading } = useTransactionById(transactionId);

  if (isLoading || !transaction) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#7c3aed" />
      </View>
    );
  }

  const defaultValues: TransactionFormValues = {
    type: transaction.type,
    amount: transaction.amount.toString(),
    merchant: transaction.merchant ?? "",
    categoryId: transaction.category_id,
    sourceId: transaction.source_id,
    date: transaction.date,
    note: transaction.note ?? "",
  };

  async function handleSubmit(value: TransactionFormValues) {
    try {
      await updateMutation.mutateAsync({
        type: value.type,
        amount: Number(value.amount),
        merchant: value.merchant || null,
        categoryId: value.categoryId,
        sourceId:
          value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
        date: value.date,
        note: value.note || null,
      });
      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Transaction updated" });
      router.back();
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed to update",
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
          Edit Transaction
        </Text>
        <View className="w-14" />
      </View>

      <TransactionForm
        defaultValues={defaultValues}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

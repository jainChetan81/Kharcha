import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Text } from "@/components/ui/text";
import {
  useDeleteTransaction,
  useTransactionById,
  useUpdateTransaction,
} from "@/hooks/use-transactions";
import { TRANSACTION_TYPE } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const updateMutation = useUpdateTransaction(transactionId);
  const deleteMutation = useDeleteTransaction();

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
      showSuccessToast("Transaction updated");
      router.back();
    } catch (err) {
      showErrorToast("Failed to update", err);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-5",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <View className="items-center">
          <Text className="text-lg font-bold text-foreground">
            Edit Transaction
          </Text>
          {transaction.subscription_id && (
            <View className="mt-1 rounded-md bg-primary/20 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-primary">
                SUBSCRIPTION
              </Text>
            </View>
          )}
        </View>
        <View className="w-14" />
      </View>

      <TransactionForm
        defaultValues={defaultValues}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onDelete={() => {
          Alert.alert("Delete Transaction", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteMutation.mutateAsync(transactionId);
                  showSuccessToast("Transaction deleted");
                  router.back();
                } catch (err) {
                  showErrorToast("Failed to delete", err);
                }
              },
            },
          ]);
        }}
        lockType={!!transaction.subscription_id}
      />
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

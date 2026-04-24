import { router, useLocalSearchParams } from "expo-router";
import { lazy, Suspense } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import type { TransactionFormValues } from "@/components/transaction-form";
import { Text } from "@/components/ui/text";
import {
  useDeleteTransaction,
  useTransactionById,
  useUpdateTransaction,
} from "@/hooks/use-transactions";
import { showDeleteConfirm } from "@/lib/alerts";
import {
  COLORS,
  INVESTMENT_KIND,
  REIMBURSEMENT_STATUS,
  SOURCE_TYPE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { safeRecomputeHolding } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

const TransactionForm = lazy(() =>
  import("@/components/transaction-form").then((m) => ({
    default: m.TransactionForm,
  })),
);

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Number(id);
  const updateMutation = useUpdateTransaction(transactionId);
  const deleteMutation = useDeleteTransaction();

  const { data: transaction, isLoading } = useTransactionById(transactionId);

  if (isLoading || !transaction) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }

  const defaultValues: TransactionFormValues = {
    type: transaction.type,
    amount: transaction.amount.toString(),
    merchant: transaction.merchant ?? "",
    categoryId: transaction.category_id,
    sourceId: transaction.source_id,
    destinationSourceId: transaction.destination_source_id,
    holdingId: transaction.holding_id ?? null,
    investmentKind: transaction.investment_kind ?? INVESTMENT_KIND.BUY,
    units: transaction.units != null ? String(transaction.units) : "",
    date: transaction.date,
    note: transaction.note ?? "",
    reimbursementStatus:
      transaction.reimbursement_status ?? REIMBURSEMENT_STATUS.NONE,
    tagIds: (transaction.tags ?? []).map((t) => t.id),
  };

  async function handleSubmit(value: TransactionFormValues) {
    try {
      const isTransfer = value.type === TRANSACTION_TYPE.TRANSFER;
      const isInvestment = value.type === TRANSACTION_TYPE.INVESTMENT;
      const originallyTransfer = transaction?.source_type === "transfer";
      // Only pass sourceType when the transfer flag is changing — otherwise
      // leave it alone so Gmail-synced / subscription-recurring provenance
      // is preserved across non-transfer edits.
      let sourceType: "manual" | "transfer" | undefined;
      if (isTransfer && !originallyTransfer) {
        sourceType = SOURCE_TYPE.TRANSFER;
      } else if (!isTransfer && originallyTransfer) {
        sourceType = SOURCE_TYPE.MANUAL;
      }
      const isExpense = value.type === TRANSACTION_TYPE.EXPENSE;
      await updateMutation.mutateAsync({
        type: value.type,
        amount: Number(value.amount),
        merchant: value.merchant || null,
        categoryId: isTransfer || isInvestment ? null : value.categoryId,
        sourceId:
          value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
        destinationSourceId: isTransfer ? value.destinationSourceId : null,
        holdingId: isInvestment ? value.holdingId : null,
        investmentKind: isInvestment ? value.investmentKind : null,
        units: isInvestment && value.units ? Number(value.units) : null,
        sourceType,
        reimbursementStatus: isExpense
          ? value.reimbursementStatus
          : REIMBURSEMENT_STATUS.NONE,
        date: value.date,
        note: value.note || null,
        tagIds: value.tagIds,
      });
      const originalHoldingId = transaction?.holding_id ?? null;
      if (originalHoldingId && originalHoldingId !== value.holdingId) {
        await safeRecomputeHolding(originalHoldingId, {
          operation: "editTransaction",
          source: "previous_holding",
        });
      }
      if (isInvestment && value.holdingId) {
        await safeRecomputeHolding(value.holdingId, {
          operation: "editTransaction",
          source: "new_holding",
        });
      }
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

      <Suspense
        fallback={
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.PRIMARY} />
          </View>
        }
      >
        <TransactionForm
          defaultValues={defaultValues}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onDelete={() => {
            showDeleteConfirm(
              "Delete Transaction",
              "This cannot be undone.",
              async () => {
                try {
                  await deleteMutation.mutateAsync(transactionId);
                  showSuccessToast("Transaction deleted");
                  router.back();
                } catch (err) {
                  showErrorToast("Failed to delete", err);
                }
              },
            );
          }}
          lockType={!!transaction.subscription_id}
        />
      </Suspense>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

import { format } from "date-fns";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useSmsSyncActive } from "@/hooks/use-feature-flags";
import { useAllSources } from "@/hooks/use-sources";
import {
  findDuplicateTransaction,
  useInsertTransaction,
} from "@/hooks/use-transactions";
import {
  DATE_TIME_FORMAT,
  DEFAULT_SOURCE_NAME,
  INVESTMENT_KIND,
  PARSED_BY,
  REIMBURSEMENT_STATUS,
  SCREENS,
  SMS_SYNC_NOTE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { parseMessage } from "@/lib/parsers";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

const DuplicateTransactionSheet = lazy(() =>
  import("@/components/duplicate-transaction-sheet").then((m) => ({
    default: m.DuplicateTransactionSheet,
  })),
);

export default function SmsForwardScreen() {
  const { text: sharedText } = useLocalSearchParams<{ text?: string }>();
  const smsActive = useSmsSyncActive();
  const insertMutation = useInsertTransaction();
  const { format: fmt } = useCurrency();
  const { data: sourcesList = [] } = useAllSources();

  const upiSourceId = useMemo(
    () =>
      sourcesList.find(
        (s) => s.name.toLowerCase() === DEFAULT_SOURCE_NAME.toLowerCase(),
      )?.id ?? null,
    [sourcesList],
  );

  const parsed = useMemo(
    () => (sharedText ? parseMessage(sharedText) : null),
    [sharedText],
  );

  const [dupSheetVisible, setDupSheetVisible] = useState(false);
  const pendingTxRef = useRef<TransactionFormValues | null>(null);

  if (!sharedText) return <Redirect href={SCREENS.HOME} />;
  if (!smsActive) return <Redirect href={SCREENS.SMS_SYNC} />;

  const rawText = sharedText;

  const defaultValues: TransactionFormValues = {
    type:
      parsed?.type === "income"
        ? TRANSACTION_TYPE.INCOME
        : TRANSACTION_TYPE.EXPENSE,
    amount: parsed ? String(parsed.amount) : "",
    merchant: parsed?.merchant ?? "",
    categoryId: null,
    sourceId: parsed?.type === "income" ? null : upiSourceId,
    destinationSourceId: null,
    holdingId: null,
    investmentKind: INVESTMENT_KIND.BUY,
    units: "",
    date: parsed
      ? `${parsed.date} 12:00`
      : format(new Date(), DATE_TIME_FORMAT),
    note: `${SMS_SYNC_NOTE}\n\n${rawText}`,
    reimbursementStatus: REIMBURSEMENT_STATUS.NONE,
    reimbursableAmount: "",
    tagIds: [],
  };

  async function commitTransaction(value: TransactionFormValues) {
    const isTransfer = value.type === TRANSACTION_TYPE.TRANSFER;
    const isExpense = value.type === TRANSACTION_TYPE.EXPENSE;
    await insertMutation.mutateAsync({
      type: value.type,
      amount: Number(value.amount),
      merchant: value.merchant || null,
      categoryId: isTransfer ? null : value.categoryId,
      sourceId: value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
      destinationSourceId: isTransfer ? value.destinationSourceId : null,
      sourceType: isTransfer ? "transfer" : undefined,
      parsedBy: parsed ? PARSED_BY.REGEX : undefined,
      reimbursementStatus: isExpense
        ? value.reimbursementStatus
        : REIMBURSEMENT_STATUS.NONE,
      reimbursableAmount:
        isExpense &&
        value.reimbursementStatus !== REIMBURSEMENT_STATUS.NONE &&
        value.reimbursableAmount
          ? Number(value.reimbursableAmount)
          : null,
      date: value.date,
      note: value.note || null,
      tagIds: value.tagIds,
    });

    showSuccessToast(
      "Transaction added",
      `${value.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}${fmt(Number(value.amount))}`,
    );

    router.replace(SCREENS.HOME);
  }

  async function handleSubmit(value: TransactionFormValues) {
    try {
      const merchant = value.merchant?.trim();
      if (merchant) {
        const isDuplicate = await findDuplicateTransaction(
          value.date,
          Number(value.amount),
          merchant,
        );
        if (isDuplicate) {
          pendingTxRef.current = value;
          setDupSheetVisible(true);
          return;
        }
      }
      await commitTransaction(value);
    } catch (err) {
      showErrorToast("Failed to save", err);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-3",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">From SMS</Text>
        <View className="w-16" />
      </View>

      <View
        className={cn(
          "mx-5 mb-3 flex-row items-center gap-2 rounded-xl px-4 py-3",
          parsed
            ? "border border-primary/30 bg-primary/10"
            : "border border-border bg-card",
        )}
      >
        <Icon
          as={Sparkles}
          className={cn(
            "size-4",
            parsed ? "text-primary" : "text-muted-foreground",
          )}
        />
        <Text className="flex-1 text-xs font-medium text-foreground">
          {parsed
            ? "Parsed from shared SMS — review and save."
            : "Couldn't auto-parse this SMS. Fill in the details manually."}
        </Text>
      </View>

      <TransactionForm
        defaultValues={defaultValues}
        submitLabel="Save Transaction"
        onSubmit={handleSubmit}
      />

      <Suspense fallback={null}>
        <DuplicateTransactionSheet
          visible={dupSheetVisible}
          amount={fmt(Number(pendingTxRef.current?.amount ?? 0))}
          merchant={pendingTxRef.current?.merchant ?? ""}
          date={pendingTxRef.current?.date.slice(0, 10) ?? ""}
          onCancel={() => {
            pendingTxRef.current = null;
            setDupSheetVisible(false);
          }}
          onConfirm={async () => {
            const value = pendingTxRef.current;
            pendingTxRef.current = null;
            setDupSheetVisible(false);
            if (value) {
              try {
                await commitTransaction(value);
              } catch (err) {
                showErrorToast("Failed to save", err);
              }
            }
          }}
        />
      </Suspense>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

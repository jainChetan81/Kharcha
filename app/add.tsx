import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { lazy, Suspense, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, Switch, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import {
  SubscriptionForm,
  type SubscriptionFormDefaults,
} from "@/components/subscription-form";
import {
  TransactionForm,
  type TransactionFormValues,
} from "@/components/transaction-form";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useAllSources } from "@/hooks/use-sources";
import { useAddSubscription } from "@/hooks/use-subscriptions";
import { useInsertTransaction } from "@/hooks/use-transactions";
import {
  COLORS,
  DATE_TIME_FORMAT,
  QUERY_KEYS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { findDuplicateTransaction, getAllSources } from "@/lib/db";
import { getBudgetForCategory, getCategorySpent } from "@/lib/db/budgets";
import { processSubscriptions } from "@/lib/db/subscriptions";
import type { Source } from "@/lib/db/types";
import type { GeminiParsedMessage } from "@/lib/gemini/parser";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

const DuplicateTransactionSheet = lazy(() =>
  import("@/components/duplicate-transaction-sheet").then((m) => ({
    default: m.DuplicateTransactionSheet,
  })),
);

const ParseMessageSheet = lazy(() =>
  import("@/components/parse-message-sheet").then((m) => ({
    default: m.ParseMessageSheet,
  })),
);

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

  const { data: sourcesList = [] } = useAllSources();
  const upiSourceId =
    sourcesList.find((s) => s.name.toLowerCase() === "upi")?.id ?? null;

  const [dupSheetVisible, setDupSheetVisible] = useState(false);
  const pendingTxRef = useRef<TransactionFormValues | null>(null);

  const [parseSheetVisible, setParseSheetVisible] = useState(false);
  const [parsedTxDefaults, setParsedTxDefaults] =
    useState<TransactionFormValues | null>(null);
  const [parsedSubDefaults, setParsedSubDefaults] =
    useState<SubscriptionFormDefaults | null>(null);
  const [formKey, setFormKey] = useState(0);

  const defaultValues: TransactionFormValues = {
    type: TRANSACTION_TYPE.EXPENSE,
    amount: "",
    merchant: "",
    categoryId: null,
    sourceId: upiSourceId,
    destinationSourceId: null,
    date: format(new Date(), DATE_TIME_FORMAT),
    note: "",
  };

  const oneTimeDefaults: TransactionFormValues = {
    ...defaultValues,
    type:
      typeParam === TRANSACTION_TYPE.INCOME
        ? TRANSACTION_TYPE.INCOME
        : typeParam === TRANSACTION_TYPE.TRANSFER
          ? TRANSACTION_TYPE.TRANSFER
          : TRANSACTION_TYPE.EXPENSE,
  };

  function matchSourceId(
    name: string | null,
    sources: Source[],
  ): number | null {
    if (!name) return null;
    const needle = name.toLowerCase().trim();
    if (!needle) return null;
    const exact = sources.find((s) => s.name.toLowerCase() === needle);
    if (exact) return exact.id;
    if (needle.length < 3) return null;
    const partial = sources.find((s) => {
      const sourceName = s.name.toLowerCase();
      if (sourceName.length < 3) return false;
      return sourceName.includes(needle) || needle.includes(sourceName);
    });
    return partial?.id ?? null;
  }

  async function handleParsed(
    parsed: GeminiParsedMessage,
    originalText: string,
  ) {
    const sources =
      queryClient.getQueryData<Source[]>([QUERY_KEYS.SOURCES]) ??
      (await getAllSources());
    const sourceId = matchSourceId(parsed.source, sources);

    const txDefaults: TransactionFormValues = {
      type: parsed.type,
      amount: String(parsed.amount),
      merchant: parsed.merchant ?? "",
      categoryId: null,
      sourceId,
      destinationSourceId: null,
      date: `${parsed.date} 12:00`,
      note: originalText.trim(),
    };
    setParsedTxDefaults(txDefaults);

    if (parsed.is_subscription) {
      setParsedSubDefaults({
        name: parsed.merchant ?? "",
        amount: String(parsed.amount),
        billingDay: parsed.billing_day ? String(parsed.billing_day) : "",
        sourceId,
      });
      setIsSubscription(true);
    } else {
      setParsedSubDefaults(null);
      setIsSubscription(false);
    }

    setFormKey((k) => k + 1);
    setParseSheetVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (parsed.confidence === "high") {
      showSuccessToast("form filled from message ✨");
    } else if (parsed.confidence === "medium") {
      showSuccessToast(
        "form filled from message ✨",
        "please verify the parsed details",
      );
    } else {
      showErrorToast("low confidence — please check all fields");
    }
  }

  async function commitTransaction(value: TransactionFormValues) {
    const isTransfer = value.type === TRANSACTION_TYPE.TRANSFER;
    await insertMutation.mutateAsync({
      type: value.type,
      amount: Number(value.amount),
      merchant: value.merchant || null,
      categoryId: isTransfer ? null : value.categoryId,
      sourceId: value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
      destinationSourceId: isTransfer ? value.destinationSourceId : null,
      sourceType: isTransfer ? "transfer" : undefined,
      date: value.date,
      note: value.note || null,
    });

    if (isTransfer) {
      showSuccessToast("Transfer added", fmt(Number(value.amount)));
    } else {
      showSuccessToast(
        "Transaction added",
        `${value.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}${fmt(Number(value.amount))}`,
      );
    }

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
  }

  async function handleTransactionSubmit(value: TransactionFormValues) {
    try {
      const merchant = value.merchant?.trim();
      // Skip duplicate check when no merchant is provided — merchant is the
      // strongest dedupe signal, and date+amount alone produce too many
      // false positives (e.g. multiple ₹100 cash expenses on the same day).
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
        <Text className="text-lg font-bold text-foreground">
          {isSubscription ? "Add Subscription" : "Add Transaction"}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setParseSheetVisible(true);
          }}
          className="w-14 items-end py-1"
          hitSlop={8}
        >
          <Icon as={Sparkles} className="size-6 text-primary" />
        </Pressable>
      </View>

      <View className="mx-5 mb-3 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
        <Text className="text-sm font-medium text-foreground">
          Subscription
        </Text>
        <Switch
          value={isSubscription}
          onValueChange={(val) => {
            Haptics.selectionAsync();
            setIsSubscription(val);
          }}
          trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
          thumbColor={COLORS.FOREGROUND}
        />
      </View>

      {isSubscription ? (
        <SubscriptionForm
          key={`sub-${formKey}`}
          defaultValues={parsedSubDefaults ?? undefined}
          onSubmit={handleSubscriptionSubmit}
        />
      ) : (
        <TransactionForm
          key={`tx-${formKey}-${upiSourceId}`}
          defaultValues={parsedTxDefaults ?? oneTimeDefaults}
          submitLabel="Add Transaction"
          onSubmit={handleTransactionSubmit}
        />
      )}

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

      <Suspense fallback={null}>
        <ParseMessageSheet
          visible={parseSheetVisible}
          onClose={() => setParseSheetVisible(false)}
          onParsed={handleParsed}
        />
      </Suspense>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

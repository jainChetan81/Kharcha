import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SubscriptionFormDefaults,
  SubscriptionFormSubmitValue,
} from "@/components/subscription-form";
import type { TransactionFormValues } from "@/components/transaction-form";
import { useAllCategories } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { getAllSources, useAllSources } from "@/hooks/use-sources";
import {
  processSubscriptions,
  useAddSubscription,
} from "@/hooks/use-subscriptions";
import {
  findDuplicateTransaction,
  getBudgetForCategory,
  getCategorySpent,
  useInsertTransaction,
} from "@/hooks/use-transactions";
import {
  BUDGET_CRITICAL_THRESHOLD,
  CONFIG_KEYS,
  DATE_TIME_FORMAT,
  DEFAULT_SOURCE_NAME,
  INVESTMENT_KIND,
  PARSED_BY,
  type ParsedByType,
  QUERY_KEYS,
  REIMBURSEMENT_STATUS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { safeRecomputeHolding } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import type { Source } from "@/lib/db/types";
import {
  ERROR_TYPE,
  FIREBASE_EVENTS,
  logEvent,
  logFirebaseError,
} from "@/lib/firebase";
import type { GeminiParsedTransaction } from "@/lib/gemini/client";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const FAILED_TO_SAVE = "Failed to save";

export type UseAddTransactionReturn = {
  isSubscription: boolean;
  toggleSubscription: (val: boolean) => void;
  formKey: number;
  upiSourceId: number | null;
  transactionDefaults: TransactionFormValues;
  subscriptionDefaults: SubscriptionFormDefaults | undefined;
  hintDismissed: boolean;
  dismissHint: () => void;
  openParseSheet: () => void;
  onTransactionSubmit: (value: TransactionFormValues) => Promise<void>;
  onSubscriptionSubmit: (value: SubscriptionFormSubmitValue) => Promise<void>;
  dupSheetVisible: boolean;
  dupSheetAmountFormatted: string;
  dupSheetMerchant: string;
  dupSheetDate: string;
  onDupCancel: () => void;
  onDupConfirm: () => Promise<void>;
  parseSheetVisible: boolean;
  closeParseSheet: () => void;
  onParsed: (
    parsed: GeminiParsedTransaction,
    originalText: string,
  ) => Promise<void>;
  categoryNames: string[];
  /** Pre-filled message text from an iOS Share Sheet handoff. */
  sharedParseText: string | undefined;
};

function matchSourceId(name: string | null, sources: Source[]): number | null {
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

export function useAddTransaction(): UseAddTransactionReturn {
  const {
    type: typeParam,
    mode: modeParam,
    name: nameParam,
    amount: amountParam,
    day: dayParam,
    sourceId: sourceIdParam,
    categoryId: categoryIdParam,
    text: sharedText,
  } = useLocalSearchParams<{
    type?: string;
    mode?: string;
    name?: string;
    amount?: string;
    day?: string;
    sourceId?: string;
    categoryId?: string;
    text?: string;
  }>();
  const queryClient = useQueryClient();
  const { format: fmt } = useCurrency();
  const insertMutation = useInsertTransaction();
  const addSubMutation = useAddSubscription();

  const [isSubscription, setIsSubscription] = useState(
    modeParam === "subscription",
  );

  const { data: allCategoriesList = [] } = useAllCategories();
  const categoryNames = useMemo(
    () => allCategoriesList.map((c) => c.name),
    [allCategoriesList],
  );
  const { data: sourcesList = [] } = useAllSources();
  const upiSourceId =
    sourcesList.find(
      (s) => s.name.toLowerCase() === DEFAULT_SOURCE_NAME.toLowerCase(),
    )?.id ?? null;

  const [dupSheetVisible, setDupSheetVisible] = useState(false);
  const pendingTxRef = useRef<TransactionFormValues | null>(null);

  const [parseSheetVisible, setParseSheetVisible] = useState(false);
  const [parsedTxDefaults, setParsedTxDefaults] =
    useState<TransactionFormValues | null>(null);
  const [parsedSubDefaults, setParsedSubDefaults] =
    useState<SubscriptionFormDefaults | null>(null);
  const [formKey, setFormKey] = useState(0);
  // Track whether the current draft was prefilled by Gemini so we can stamp
  // parsed_by on the row at insert time. Reset on every new form mount —
  // editing the AI-filled draft still counts as AI-parsed (provenance is
  // about origin, not the final values).
  const [aiParsedBy, setAiParsedBy] = useState<ParsedByType | null>(null);
  const [hintDismissed, setHintDismissed] = useState(true);

  useEffect(() => {
    let alive = true;
    getConfig(CONFIG_KEYS.AI_HINT_DISMISSED)
      .then((v) => {
        if (alive) setHintDismissed(v === "1");
      })
      .catch(() => {
        // Config read failed — don't block the app, leave the hint dismissed
        // (the safer default: better to hide a helpful hint than to throw).
      });
    return () => {
      alive = false;
    };
  }, []);

  // Share-sheet handoff: if /add was opened with a `text` param (iOS Share
  // Sheet via _layout's ShareIntentListener), pop the AI Parse sheet open
  // pre-filled. The sheet itself reads `defaultText` and seeds the textarea.
  // One-shot per text payload — without the ref guard, dismissing the sheet
  // would re-open it on the next render since the ?text= param stays on the
  // URL.
  const handledShareTextRef = useRef<string | null>(null);
  useEffect(() => {
    const trimmed = sharedText?.trim() ?? "";
    if (!trimmed) return;
    if (handledShareTextRef.current === trimmed) return;
    handledShareTextRef.current = trimmed;
    setParseSheetVisible(true);
    logEvent(FIREBASE_EVENTS.SHARE_SHEET_TEXT_RECEIVED);
  }, [sharedText]);

  function dismissHint() {
    setHintDismissed(true);
    void updateConfig(CONFIG_KEYS.AI_HINT_DISMISSED, "1");
  }

  function openParseSheet() {
    Haptics.selectionAsync();
    setParseSheetVisible(true);
    if (!hintDismissed) dismissHint();
  }

  function toggleSubscription(val: boolean) {
    Haptics.selectionAsync();
    setIsSubscription(val);
  }

  const baseDefaults: TransactionFormValues = {
    type: TRANSACTION_TYPE.EXPENSE,
    amount: "",
    merchant: "",
    categoryId: null,
    sourceId: upiSourceId,
    destinationSourceId: null,
    holdingId: null,
    investmentKind: INVESTMENT_KIND.BUY,
    units: "",
    date: format(new Date(), DATE_TIME_FORMAT),
    note: "",
    reimbursementStatus: REIMBURSEMENT_STATUS.NONE,
    reimbursableAmount: "",
    tagIds: [],
  };

  const oneTimeDefaults: TransactionFormValues = {
    ...baseDefaults,
    type:
      typeParam === TRANSACTION_TYPE.INCOME
        ? TRANSACTION_TYPE.INCOME
        : typeParam === TRANSACTION_TYPE.TRANSFER
          ? TRANSACTION_TYPE.TRANSFER
          : typeParam === TRANSACTION_TYPE.INVESTMENT
            ? TRANSACTION_TYPE.INVESTMENT
            : TRANSACTION_TYPE.EXPENSE,
  };

  async function handleParsed(
    parsed: GeminiParsedTransaction,
    originalText: string,
  ) {
    const sources =
      queryClient.getQueryData<Source[]>([QUERY_KEYS.SOURCES]) ??
      (await getAllSources());
    const sourceId = matchSourceId(parsed.source ?? null, sources);

    const matchedCategory = allCategoriesList.find(
      (c) =>
        c.name.toLowerCase() === parsed.category.toLowerCase() &&
        c.type === parsed.type,
    );

    const txDefaults: TransactionFormValues = {
      type: parsed.type,
      amount: String(parsed.amount),
      merchant: parsed.merchant ?? "",
      categoryId: matchedCategory?.id ?? null,
      sourceId,
      destinationSourceId: null,
      holdingId: null,
      investmentKind: INVESTMENT_KIND.BUY,
      units: "",
      date: `${parsed.date} 12:00`,
      note: originalText.trim(),
      reimbursementStatus: REIMBURSEMENT_STATUS.NONE,
      reimbursableAmount: "",
      tagIds: [],
    };
    setParsedTxDefaults(txDefaults);

    if (parsed.is_subscription) {
      setParsedSubDefaults({
        name: parsed.merchant ?? "",
        amount: String(parsed.amount),
        billingDays: parsed.billing_day ? [parsed.billing_day] : [],
        sourceId,
      });
      setIsSubscription(true);
    } else {
      setParsedSubDefaults(null);
      setIsSubscription(false);
    }

    setAiParsedBy(PARSED_BY.GEMINI);
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
    const isExpense = value.type === TRANSACTION_TYPE.EXPENSE;
    const isInvestment = value.type === TRANSACTION_TYPE.INVESTMENT;
    await insertMutation.mutateAsync({
      type: value.type,
      amount: Number(value.amount),
      merchant: value.merchant || null,
      categoryId: isTransfer || isInvestment ? null : value.categoryId,
      sourceId: value.type === TRANSACTION_TYPE.INCOME ? null : value.sourceId,
      destinationSourceId: isTransfer ? value.destinationSourceId : null,
      holdingId: isInvestment ? value.holdingId : null,
      investmentKind: isInvestment ? value.investmentKind : null,
      units: isInvestment && value.units ? Number(value.units) : null,
      sourceType: isTransfer ? "transfer" : undefined,
      // Stamp parsed_by so the AI badge in TransactionItem renders for manual
      // AI-parsed entries — without this it only ever fires for Gmail-synced
      // rows, even though the data flow is identical.
      parsedBy: aiParsedBy ?? undefined,
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

    if (isInvestment && value.holdingId) {
      // Portfolio/holdings queries are invalidated by useInvalidateTransactions
      // from useInsertTransaction.onSuccess. safeRecomputeHolding swallows
      // failures and forwards to crashlytics so the toast + navigation below
      // still fire even if the reducer chokes on a bad row.
      await safeRecomputeHolding(value.holdingId, {
        operation: "commitTransaction",
      });
    }

    if (isTransfer) {
      showSuccessToast("Transfer added", fmt(Number(value.amount)));
    } else if (isInvestment) {
      showSuccessToast(
        `${value.investmentKind} recorded`,
        fmt(Number(value.amount)),
      );
    } else {
      showSuccessToast(
        "Transaction added",
        `${value.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}${fmt(Number(value.amount))}`,
      );
    }

    if (value.type === TRANSACTION_TYPE.EXPENSE && value.categoryId) {
      try {
        const budget = await getBudgetForCategory(value.categoryId);
        if (budget) {
          const yearMonth = value.date.slice(0, 7);
          const spent = await getCategorySpent(value.categoryId, yearMonth);
          const totalSpent = spent + Number(value.amount);
          if (totalSpent >= budget) {
            showErrorToast(`⚠️ ${value.merchant || "Category"} budget exceeded`);
          } else if (totalSpent >= budget * BUDGET_CRITICAL_THRESHOLD) {
            showErrorToast(
              `⚠️ Approaching ${value.merchant || "category"} budget`,
            );
          }
        }
      } catch (error) {
        // Non-critical: the transaction already saved and already showed its
        // own success toast. A budget-check failure must never surface as
        // "Failed to save" or skip the setAiParsedBy/router.back() below —
        // mirrors safeRecomputeHolding's swallow-and-report pattern
        // (lib/db/holdings.ts).
        logFirebaseError(error, {
          error_type: ERROR_TYPE.DB,
          operation: "budgetThresholdCheck",
        });
      }
    }

    setAiParsedBy(null);
    router.back();
  }

  async function handleTransactionSubmit(value: TransactionFormValues) {
    const merchant = value.merchant?.trim();
    // Skip duplicate check when no merchant is provided — merchant is the
    // strongest dedupe signal, and date+amount alone produce too many
    // false positives (e.g. multiple ₹100 cash expenses on the same day).
    if (merchant) {
      let isDuplicate: boolean;
      try {
        isDuplicate = await findDuplicateTransaction(
          value.date,
          Number(value.amount),
          merchant,
        );
      } catch (err) {
        showErrorToast(FAILED_TO_SAVE, err);
        return;
      }
      if (isDuplicate) {
        pendingTxRef.current = value;
        setDupSheetVisible(true);
        return;
      }
    }
    try {
      await commitTransaction(value);
    } catch {
      // useInsertTransaction's onError already toasted "Transaction failed".
    }
  }

  async function handleSubscriptionSubmit(value: SubscriptionFormSubmitValue) {
    try {
      await addSubMutation.mutateAsync(value);
    } catch {
      // useAddSubscription's onError already toasted
      // "Subscription update failed".
      return;
    }
    try {
      await processSubscriptions();
      await queryClient.invalidateQueries();
      showSuccessToast(
        "Subscription added",
        `Renews on day ${value.billingDays.join(", ")} every month`,
      );
      router.back();
    } catch (err) {
      showErrorToast(FAILED_TO_SAVE, err);
    }
  }

  function onDupCancel() {
    pendingTxRef.current = null;
    setDupSheetVisible(false);
  }

  async function onDupConfirm() {
    const value = pendingTxRef.current;
    pendingTxRef.current = null;
    setDupSheetVisible(false);
    if (value) {
      try {
        await commitTransaction(value);
      } catch {
        // useInsertTransaction's onError already toasted "Transaction failed".
      }
    }
  }

  // Defaults seeded from a "candidate" tap on the Subscriptions screen —
  // pre-fills the subscription form so the user just confirms. Falls back to
  // AI-parsed defaults when both are present (parse takes priority since
  // it's a more recent intent).
  const candidateSubDefaults: SubscriptionFormDefaults | undefined =
    modeParam === "subscription" && (nameParam || amountParam)
      ? {
          name: nameParam ?? "",
          amount: amountParam ?? "",
          billingDays: dayParam ? [Number(dayParam)] : [],
          sourceId: sourceIdParam ? Number(sourceIdParam) : null,
          categoryId: categoryIdParam ? Number(categoryIdParam) : null,
        }
      : undefined;

  return {
    isSubscription,
    toggleSubscription,
    formKey,
    upiSourceId,
    transactionDefaults: parsedTxDefaults ?? oneTimeDefaults,
    subscriptionDefaults:
      parsedSubDefaults ?? candidateSubDefaults ?? undefined,
    hintDismissed,
    dismissHint,
    openParseSheet,
    onTransactionSubmit: handleTransactionSubmit,
    onSubscriptionSubmit: handleSubscriptionSubmit,
    dupSheetVisible,
    dupSheetAmountFormatted: fmt(Number(pendingTxRef.current?.amount ?? 0)),
    dupSheetMerchant: pendingTxRef.current?.merchant ?? "",
    dupSheetDate: pendingTxRef.current?.date.slice(0, 10) ?? "",
    onDupCancel,
    onDupConfirm,
    parseSheetVisible,
    closeParseSheet: () => setParseSheetVisible(false),
    onParsed: handleParsed,
    categoryNames,
    sharedParseText: sharedText,
  };
}

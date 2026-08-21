import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Fuse from "fuse.js";
import { Alert } from "react-native";
import {
  CONFIG_KEYS,
  OTHER_CATEGORY_LABEL,
  PAGE_SIZE,
  QUERY_KEYS,
  SOURCE_TYPE,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import {
  clearAllTransactions,
  deleteTransaction,
  findDuplicateTransaction,
  getAllTransactionsFiltered,
  getBiggestTransaction,
  getCategoryBreakdown,
  getMerchantBreakdown,
  getMonthlyInsights,
  getMonthlySummary,
  getMonthTransactions,
  getRecentTransactions,
  getReimbursementSummary,
  getTotalMonthlyBudget,
  getTrackingStreak,
  getTransactionById,
  getTransactionCount,
  getTransactionsPaginated,
  insertTransaction,
  seedSampleData,
  setReimbursementStatus,
  type TransactionRow,
  updateTransaction,
} from "@/lib/db";
import { getBudgetForCategory, getCategorySpent } from "@/lib/db/budgets";
import { deleteConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { isConfigured, pushTransactionToMini } from "@/lib/mini-sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { syncWidgetData } from "@/lib/widget";

// Re-export imperative db functions used in forms
export { findDuplicateTransaction, getBudgetForCategory, getCategorySpent };

export function useInvalidateTransactions() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MERCHANT_BREAKDOWN],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TOTAL_MONTHLY_BUDGET],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_INSIGHTS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.REIMBURSEMENT_SUMMARY],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.FILTERED_INSIGHTS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.HOLDINGS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.HOLDING],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.HOLDING_TRANSACTIONS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.PORTFOLIO_SUMMARY],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTION],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.BIGGEST_TRANSACTION],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTION_COUNT],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRACKING_STREAK],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.DAILY_SPEND],
      }),
    ]).then((result) => {
      syncWidgetData();
      return result;
    });
}

export function useRecentTransactions(limit = 10) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS],
    queryFn: () => getRecentTransactions(limit),
  });
}

export function useMonthTransactions(yearMonth: string, limit = 10) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS, yearMonth],
    queryFn: () => getMonthTransactions(yearMonth, limit),
  });
}

export function useMonthlySummary(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.MONTHLY_SUMMARY, yearMonth],
    queryFn: () => getMonthlySummary(yearMonth),
  });
}

export function useMonthlyInsights(year: number, month: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.MONTHLY_INSIGHTS, year, month],
    queryFn: () => getMonthlyInsights(year, month),
  });
}

export function useCategoryBreakdown(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN, yearMonth],
    queryFn: () => getCategoryBreakdown(yearMonth),
  });
}

export function useMerchantBreakdown(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.MERCHANT_BREAKDOWN, yearMonth],
    queryFn: () => getMerchantBreakdown(yearMonth),
  });
}

export function useBiggestTransaction(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.BIGGEST_TRANSACTION, yearMonth],
    queryFn: () => getBiggestTransaction(yearMonth),
  });
}

export function useTransactionCount(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTION_COUNT, yearMonth],
    queryFn: () => getTransactionCount(yearMonth),
  });
}

export function useTrackingStreak(asOf?: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRACKING_STREAK, asOf ?? "today"],
    queryFn: () => getTrackingStreak(asOf),
  });
}

export function useTotalMonthlyBudget() {
  return useQuery({
    queryKey: [QUERY_KEYS.TOTAL_MONTHLY_BUDGET],
    queryFn: getTotalMonthlyBudget,
  });
}

export function useTransactionById(id: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTION, id],
    queryFn: () => getTransactionById(id),
    enabled: !!id,
  });
}

export type FilteredInsights = {
  count: number;
  income: number;
  spent: number;
  transferred: number;
  net: number;
  topCategories: { name: string; total: number }[];
  biggestTransaction: { label: string; amount: number } | null;
  mostFrequentMerchant: { merchant: string; count: number } | null;
  daySpan: number;
  avgPerDay: number;
};

type InsightsFilters = Parameters<typeof getAllTransactionsFiltered>[0];

function computeInsights(txs: TransactionRow[]): FilteredInsights {
  let income = 0;
  let spent = 0;
  let transferred = 0;
  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, number>();
  const distinctDays = new Set<string>();
  let biggest: { label: string; amount: number } | null = null;

  for (const t of txs) {
    // Investments are portfolio movements, not cash-flow buckets — they must
    // never land in spent / income / transferred here. Explicit skip so the
    // intent is visible to anyone adding a fifth type later.
    if (t.type === TRANSACTION_TYPE.INVESTMENT) continue;

    if (t.type === TRANSACTION_TYPE.INCOME) income += t.amount;
    else if (t.type === TRANSACTION_TYPE.EXPENSE) spent += t.amount;
    else if (t.type === TRANSACTION_TYPE.TRANSFER) transferred += t.amount;

    if (t.type === TRANSACTION_TYPE.EXPENSE) {
      const cat = t.category_name ?? OTHER_CATEGORY_LABEL;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + t.amount);
      if (!biggest || t.amount > biggest.amount) {
        biggest = {
          label: t.merchant || cat,
          amount: t.amount,
        };
      }
      if (t.merchant) {
        byMerchant.set(t.merchant, (byMerchant.get(t.merchant) ?? 0) + 1);
      }
      distinctDays.add(t.date.slice(0, 10));
    }
  }

  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({ name, total }));

  const topMerchant = [...byMerchant.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostFrequentMerchant = topMerchant
    ? { merchant: topMerchant[0], count: topMerchant[1] }
    : null;

  const daySpan = distinctDays.size;
  const avgPerDay = daySpan > 0 ? spent / daySpan : 0;

  return {
    count: txs.length,
    income,
    spent,
    transferred,
    net: income - spent,
    topCategories,
    biggestTransaction: biggest,
    mostFrequentMerchant,
    daySpan,
    avgPerDay,
  };
}

function buildTransactionFuse(rows: TransactionRow[]): Fuse<TransactionRow> {
  return new Fuse<TransactionRow>(rows, {
    keys: [
      { name: "merchant", weight: 0.5 },
      { name: "note", weight: 0.25 },
      {
        name: "tags",
        weight: 0.15,
        getFn: (t) => t.tags?.map((tag) => tag.name) ?? [],
      },
      {
        name: "amount",
        weight: 0.1,
        getFn: (t) => String(t.amount ?? ""),
      },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
}

export function useFilteredInsights(filters: InsightsFilters) {
  return useQuery({
    queryKey: [QUERY_KEYS.FILTERED_INSIGHTS, filters],
    queryFn: async () => {
      const trimmedSearch = filters?.search?.trim() ?? "";
      const { search: _search, ...rest } = filters ?? {};
      const rows = await getAllTransactionsFiltered(rest);
      if (trimmedSearch.length === 0) return computeInsights(rows);
      const filtered = buildTransactionFuse(rows)
        .search(trimmedSearch)
        .map((r) => r.item);
      return computeInsights(filtered);
    },
  });
}

export const SEARCH_RESULT_CAP = 200;

export function useTransactionsPaginated(filters: {
  type?: "income" | "expense" | "transfer" | "investment" | "all";
  categoryId?: number | null;
  sourceId?: number | null;
  sourceType?:
    | "manual"
    | "synced"
    | "mini_synced"
    | "recurring"
    | "transfer"
    | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  search?: string;
  reimbursement?: "all" | "pending" | "reimbursed";
  tagIds?: number[] | null;
  merchant?: string | null;
}) {
  const trimmedSearch = filters.search?.trim() ?? "";
  const isSearching = trimmedSearch.length > 0;
  const { search: _search, ...filtersWithoutSearch } = filters;

  const infiniteQuery = useInfiniteQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED, filtersWithoutSearch],
    queryFn: ({ pageParam = 0 }) =>
      getTransactionsPaginated(PAGE_SIZE, pageParam, filtersWithoutSearch),
    initialPageParam: 0,
    enabled: !isSearching,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });

  const searchQuery = useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS_SEARCH, filters],
    queryFn: async () => {
      const rows = await getAllTransactionsFiltered(filtersWithoutSearch);
      return buildTransactionFuse(rows)
        .search(trimmedSearch)
        .slice(0, SEARCH_RESULT_CAP)
        .map((r) => r.item);
    },
    enabled: isSearching,
  });

  const data = isSearching
    ? searchQuery.data
      ? { pages: [searchQuery.data], pageParams: [0] }
      : undefined
    : infiniteQuery.data;

  return {
    data,
    fetchNextPage: isSearching
      ? () => Promise.resolve()
      : infiniteQuery.fetchNextPage,
    hasNextPage: isSearching ? false : (infiniteQuery.hasNextPage ?? false),
    isFetchingNextPage: isSearching ? false : infiniteQuery.isFetchingNextPage,
    isLoading: isSearching ? searchQuery.isLoading : infiniteQuery.isLoading,
    isFetching: isSearching ? searchQuery.isFetching : infiniteQuery.isFetching,
    refetch: isSearching ? searchQuery.refetch : infiniteQuery.refetch,
    error: isSearching ? searchQuery.error : infiniteQuery.error,
  };
}

export function useInsertTransaction() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: insertTransaction,
    onSuccess: (_data, variables) => {
      logEvent(FIREBASE_EVENTS.TRANSACTION_ADDED, {
        source_type: variables.sourceType ?? "manual",
        transaction_type: variables.type,
      });

      // Invalidate before the mini push — the local insert already succeeded,
      // and a sleeping mini (15s timeout) must never delay the UI update.
      invalidate();

      const isManualEntry =
        (variables.sourceType ?? SOURCE_TYPE.MANUAL) === SOURCE_TYPE.MANUAL;
      const isPushableType =
        variables.type === TRANSACTION_TYPE.INCOME ||
        variables.type === TRANSACTION_TYPE.EXPENSE;

      if (
        isManualEntry &&
        isPushableType &&
        isConfigured() &&
        variables.merchant
      ) {
        // Best-effort, fire-and-forget push: the error is never surfaced to
        // the user. The next pull cycle can reconcile.
        // SAFETY: isPushableType narrowed variables.type to income|expense above.
        void pushTransactionToMini({
          type: variables.type as "income" | "expense",
          amount: variables.amount,
          merchant: variables.merchant,
          date: variables.date,
          rawText: variables.note ?? variables.merchant,
          senderId: "manual",
        })
          .then(() => logEvent(FIREBASE_EVENTS.MINI_PUSH_SUCCEEDED))
          .catch(() => logEvent(FIREBASE_EVENTS.MINI_PUSH_FAILED));
      }
    },
    onError: (err) => {
      showErrorToast("Transaction failed", err);
    },
  });
}

export function useUpdateTransaction(id: number) {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: (params: Parameters<typeof updateTransaction>[1]) =>
      updateTransaction(id, params),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.TRANSACTION_EDITED);
      invalidate();
    },
    onError: (err) => {
      showErrorToast("Transaction failed", err);
    },
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: (id: number) => deleteTransaction(id),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.TRANSACTION_DELETED);
      invalidate();
    },
    onError: (err) => {
      showErrorToast("Transaction failed", err);
    },
  });
}

export function useClearAllTransactions() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: async () => {
      await clearAllTransactions();
      await deleteConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      showErrorToast("Transaction failed", err);
    },
  });
}

export function useClearTransactionsWithConfirm() {
  const mutation = useClearAllTransactions();
  return () => {
    Alert.alert(
      "Clear All Transactions",
      "This will permanently delete all your transactions. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await mutation.mutateAsync();
              showSuccessToast("All transactions deleted");
            } catch {
              // useClearAllTransactions's onError already toasted
              // "Transaction failed".
            }
          },
        },
      ],
    );
  };
}

export function useReimbursementSummary() {
  return useQuery({
    queryKey: [QUERY_KEYS.REIMBURSEMENT_SUMMARY],
    queryFn: getReimbursementSummary,
  });
}

export function useSetReimbursementStatus() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: "none" | "pending" | "reimbursed";
    }) => setReimbursementStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (err) => {
      showErrorToast("Transaction failed", err);
    },
  });
}

export function useSwipeDelete() {
  const deleteMutation = useDeleteTransaction();

  return async (item: TransactionRow) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      showSuccessToast("Transaction deleted");
    } catch {
      // useDeleteTransaction's onError already toasted "Transaction failed"
      // (and fired the error haptic) — don't toast again here.
    }
  };
}

export function useSeedSampleData() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: seedSampleData,
    onSuccess: (seeded) => {
      if (seeded) {
        invalidate();
        showSuccessToast("Sample data seeded");
      } else {
        showErrorToast("Data already exists", "Clear all transactions first");
      }
    },
    onError: (err) => {
      showErrorToast("Sample data failed", err);
    },
  });
}

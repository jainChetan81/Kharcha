import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert } from "react-native";
import { CONFIG_KEYS, PAGE_SIZE, QUERY_KEYS } from "@/lib/constants";
import {
  clearAllTransactions,
  deleteTransaction,
  findDuplicateTransaction,
  getCategoryBreakdown,
  getMonthlyInsights,
  getMonthlySummary,
  getMonthTransactions,
  getRecentTransactions,
  getReimbursementSummary,
  getTransactionById,
  getTransactionsPaginated,
  insertTransaction,
  restoreTransaction,
  seedSampleData,
  setReimbursementStatus,
  type TransactionRow,
  updateTransaction,
} from "@/lib/db";
import { getBudgetForCategory, getCategorySpent } from "@/lib/db/budgets";
import { deleteConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { showErrorToast, showSuccessToast, showUndoToast } from "@/lib/toast";
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

export function useTransactionById(id: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTION, id],
    queryFn: () => getTransactionById(id),
    enabled: !!id,
  });
}

export function useTransactionsPaginated(filters: {
  type?: "income" | "expense" | "transfer" | "all";
  categoryId?: number | null;
  sourceId?: number | null;
  sourceType?: "manual" | "synced" | "recurring" | "transfer" | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  search?: string;
  reimbursement?: "all" | "pending" | "reimbursed";
  tagIds?: number[] | null;
}) {
  return useInfiniteQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED, filters],
    queryFn: ({ pageParam = 0 }) =>
      getTransactionsPaginated(PAGE_SIZE, pageParam, filters),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });
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
      invalidate();
    },
    onError: (err) => {
      console.error("Transaction mutation failed:", err);
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
      console.error("Transaction mutation failed:", err);
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
      console.error("Transaction mutation failed:", err);
    },
  });
}

export function useRestoreTransaction() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: restoreTransaction,
    onSuccess: () => invalidate(),
    onError: (err) => {
      console.error("Transaction mutation failed:", err);
    },
  });
}

export function useClearAllTransactions() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: async () => {
      await clearAllTransactions();
      await deleteConfig(CONFIG_KEYS.BACKEND_LAST_SYNCED_AT);
      await deleteConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      console.error("Transaction mutation failed:", err);
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
            } catch (err) {
              showErrorToast("Failed", err);
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
      console.error("Transaction mutation failed:", err);
    },
  });
}

export function useSwipeDelete() {
  const deleteMutation = useDeleteTransaction();
  const restoreMutation = useRestoreTransaction();

  return async (item: TransactionRow) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      showUndoToast("Transaction deleted", async () => {
        await restoreMutation.mutateAsync(item);
      });
    } catch {
      showErrorToast("Failed to delete");
    }
  };
}

export function useSeedSampleData() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: seedSampleData,
    onSuccess: () => invalidate(),
    onError: (err) => {
      console.error("Sample data mutation failed:", err);
    },
  });
}

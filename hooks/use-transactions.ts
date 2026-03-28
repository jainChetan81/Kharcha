import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import { PAGE_SIZE, QUERY_KEYS, TOAST_TYPE } from "@/lib/constants";
import {
  clearAllTransactions,
  deleteTransaction,
  getCategoryBreakdown,
  getMonthlySummary,
  getRecentTransactions,
  getTransactionById,
  getTransactionsPaginated,
  insertTransaction,
  reinsertTransaction,
  type TransactionRow,
  updateTransaction,
} from "@/lib/db";

function useInvalidateTransactions() {
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
    ]);
}

export function useRecentTransactions(limit = 10) {
  return useQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS],
    queryFn: () => getRecentTransactions(limit),
  });
}

export function useMonthlySummary(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.MONTHLY_SUMMARY, yearMonth],
    queryFn: () => getMonthlySummary(yearMonth),
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
  type?: "income" | "expense" | "all";
  categoryId?: number | null;
  sourceId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
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
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTransaction(id: number) {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: (params: Parameters<typeof updateTransaction>[1]) =>
      updateTransaction(id, params),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: (id: number) => deleteTransaction(id),
    onSuccess: () => invalidate(),
  });
}

export function useReinsertTransaction() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: reinsertTransaction,
    onSuccess: () => invalidate(),
  });
}

export function useClearAllTransactions() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: clearAllTransactions,
    onSuccess: () => invalidate(),
  });
}

export function useSwipeDelete() {
  const deleteMutation = useDeleteTransaction();
  const reinsertMutation = useReinsertTransaction();

  return async (item: TransactionRow) => {
    try {
      await deleteMutation.mutateAsync(item.id);
      Toast.show({
        type: TOAST_TYPE.UNDO,
        text1: "Transaction deleted",
        visibilityTime: 5000,
        props: {
          onUndo: async () => {
            Toast.hide();
            try {
              await reinsertMutation.mutateAsync(item);
              Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Transaction restored" });
            } catch {
              Toast.show({ type: TOAST_TYPE.ERROR, text1: "Failed to undo" });
            }
          },
        },
      });
    } catch {
      Toast.show({ type: TOAST_TYPE.ERROR, text1: "Failed to delete" });
    }
  };
}

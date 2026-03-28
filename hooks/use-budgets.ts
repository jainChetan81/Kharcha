import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  type BudgetRow,
  deleteBudget,
  getBudgets,
  setBudget,
} from "@/lib/db/budgets";

export type { BudgetRow };

export function useBudgets() {
  return useQuery({
    queryKey: [QUERY_KEYS.BUDGETS],
    queryFn: getBudgets,
  });
}

export function useSetBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: number; amount: number }) =>
      setBudget(categoryId, amount),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BUDGETS] }),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) => deleteBudget(categoryId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BUDGETS] }),
  });
}

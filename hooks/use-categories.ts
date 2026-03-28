import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addCategory,
  deleteCategory,
  getAllCategories,
  getCategoriesByType,
} from "@/lib/db";

export function useAllCategories() {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, "all"],
    queryFn: getAllCategories,
  });
}

export function useCategoriesByType(
  type: "income" | "expense" | "all",
  enabled = true,
) {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, "filter", type],
    queryFn: () =>
      type === "all"
        ? getAllCategories()
        : getCategoriesByType(type as "income" | "expense"),
    enabled,
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, type }: { name: string; type: "income" | "expense" }) =>
      addCategory(name, type),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CATEGORIES] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CATEGORIES] }),
  });
}

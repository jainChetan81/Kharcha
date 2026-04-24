import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addTag,
  deleteTag,
  getAllTags,
  getAllTimeTagBreakdown,
  getTagBreakdown,
  renameTag,
  updateTagOrder,
} from "@/lib/db";

export function useAllTags() {
  return useQuery({
    queryKey: [QUERY_KEYS.TAGS],
    queryFn: getAllTags,
  });
}

export function useTagBreakdown(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.TAG_BREAKDOWN, yearMonth],
    queryFn: () => getTagBreakdown(yearMonth),
  });
}

export function useAllTimeTagBreakdown() {
  return useQuery({
    queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
    queryFn: getAllTimeTagBreakdown,
  });
}

function useInvalidateTags() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TAGS] }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TAG_BREAKDOWN] }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
      }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTION] }),
    ]);
}

export function useAddTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (name: string) => addTag(name),
    onSuccess: () => invalidate(),
  });
}

export function useRenameTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameTag(id, name),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => invalidate(),
  });
}

export function useReorderTags() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (items: { id: number; sort_order: number }[]) =>
      updateTagOrder(items),
    onSuccess: () => invalidate(),
  });
}

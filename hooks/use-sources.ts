import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { addSource, deleteSource, getAllSources } from "@/lib/db";

export function useAllSources(enabled = true) {
  return useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
    enabled,
  });
}

export function useAddSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => addSource(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SOURCES] }),
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSource(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SOURCES] }),
  });
}

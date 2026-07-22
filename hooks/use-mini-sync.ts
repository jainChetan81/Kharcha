import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getAllConfig, updateConfig } from "@/lib/db/config";
import { env } from "@/lib/env";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { syncMiniTransactions } from "@/lib/mini-sync";

export function useMiniSyncConfig() {
  const queryClient = useQueryClient();

  const { data: raw } = useQuery({
    queryKey: [QUERY_KEYS.CONFIG],
    queryFn: getAllConfig,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateConfig(key, value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONFIG] }),
  });

  const configured = Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
  const enabledFlag = raw?.[CONFIG_KEYS.MINI_SYNC_ENABLED];
  // Default to enabled when the mini env vars are configured and the user
  // hasn't explicitly toggled it off. This avoids needing a settings screen
  // in v1 while still letting a future toggle disable the feature.
  const enabled =
    enabledFlag === "1" || (enabledFlag === undefined && configured);
  const lastId = raw?.[CONFIG_KEYS.MINI_SYNC_LAST_ID] ?? null;

  const setEnabled = async (value: boolean): Promise<void> => {
    await mutation.mutateAsync({
      key: CONFIG_KEYS.MINI_SYNC_ENABLED,
      value: value ? "1" : "0",
    });
  };

  const setLastId = async (id: number): Promise<void> => {
    await mutation.mutateAsync({
      key: CONFIG_KEYS.MINI_SYNC_LAST_ID,
      value: String(id),
    });
  };

  return {
    enabled,
    lastId,
    setEnabled,
    setLastId,
  };
}

// Default is an incremental pull from the stored cursor. `{ full: true }`
// re-walks the mini from the beginning (used by the home-screen sync button)
// — safe because the pull path dedupes per row.
export function useMiniSync(options?: { full?: boolean }) {
  const queryClient = useQueryClient();
  const full = options?.full ?? false;

  return useMutation({
    mutationFn: async () => {
      logEvent(FIREBASE_EVENTS.MINI_SYNC_STARTED);
      const result = await syncMiniTransactions(full ? { full } : undefined);

      if (result.notConfigured) {
        throw new Error("Mini sync not configured");
      }

      return { result };
    },
    onSuccess: (data) => {
      logEvent(FIREBASE_EVENTS.MINI_SYNC_COMPLETED, {
        count: String(data.result.added),
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.REIMBURSEMENT_SUMMARY],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
      });
    },
    onError: () => {
      logEvent(FIREBASE_EVENTS.MINI_SYNC_FAILED);
    },
  });
}

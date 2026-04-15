import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type BackupSummary,
  backupNow,
  getLatestBackup,
  getProvider,
  restoreFromCloud,
} from "@/lib/cloud-backup";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";

const QUERY_KEY = "cloud-backup";

export function useCloudBackupSettings() {
  const queryClient = useQueryClient();
  const enabledQuery = useQuery({
    queryKey: [QUERY_KEY, "enabled"],
    queryFn: async () =>
      (await getConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED)) === "1",
  });

  const setEnabledMutation = useMutation({
    mutationFn: async (next: boolean) => {
      await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED, next ? "1" : "0");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "enabled"] });
    },
  });

  return {
    enabled: enabledQuery.data ?? false,
    isLoading: enabledQuery.isLoading,
    setEnabled: setEnabledMutation.mutateAsync,
    provider: getProvider(),
  };
}

export function useLatestBackup() {
  return useQuery<BackupSummary | null>({
    queryKey: [QUERY_KEY, "latest"],
    queryFn: () => getLatestBackup(),
  });
}

export function useBackupNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backupNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useRestoreFromCloud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreFromCloud,
    onSuccess: () => {
      // Invalidate everything — restored DB has different data for every key.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MONTHLY_SUMMARY] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_INSIGHTS],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CATEGORIES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SOURCES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SUBSCRIPTIONS] });
    },
  });
}

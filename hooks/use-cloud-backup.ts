import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  type BackupSummary,
  backupNow,
  getLatestBackup,
  getProvider,
  restoreFromCloud,
} from "@/lib/cloud-backup";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { initDB } from "@/lib/db";
import { exportDatabase, importDatabase } from "@/lib/db/backup";
import { getConfig, updateConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";

export function useCloudBackupSettings() {
  const queryClient = useQueryClient();
  // Single SQLite read returns both flags — avoids two useQuery reads on
  // every mount.
  const settingsQuery = useQuery({
    queryKey: [QUERY_KEYS.CLOUD_BACKUP, "settings"],
    queryFn: async () => {
      const [enabled, lastAt] = await Promise.all([
        getConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED),
        getConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_AT),
      ]);
      return {
        enabled: enabled === "1",
        hasEverBackedUp: Boolean(lastAt),
      };
    },
  });

  const setEnabledMutation = useMutation({
    mutationFn: async (next: boolean) => {
      await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED, next ? "1" : "0");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CLOUD_BACKUP, "settings"],
      });
    },
  });

  // mutateAsync identity isn't guaranteed stable across renders; wrap so
  // the memoized return object stays referentially equal when inputs don't
  // change.
  const { mutateAsync } = setEnabledMutation;
  const setEnabled = useCallback(
    (next: boolean) => mutateAsync(next),
    [mutateAsync],
  );

  return useMemo(
    () => ({
      enabled: settingsQuery.data?.enabled ?? false,
      hasEverBackedUp: settingsQuery.data?.hasEverBackedUp ?? false,
      isLoading: settingsQuery.isLoading,
      setEnabled,
      provider: getProvider(),
    }),
    [settingsQuery.data, settingsQuery.isLoading, setEnabled],
  );
}

// Only fetch remote metadata when the user has opted in or we have a prior
// backup — otherwise opening the Export screen would trigger a Drive list
// (or iCloud stat) for users who never intend to back up.
export function useLatestBackup(options?: { enabled?: boolean }) {
  return useQuery<BackupSummary | null>({
    queryKey: [QUERY_KEYS.CLOUD_BACKUP, "latest"],
    queryFn: () => getLatestBackup(),
    staleTime: 1000 * 60 * 5,
    enabled: options?.enabled ?? false,
  });
}

export function useBackupNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backupNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CLOUD_BACKUP] });
    },
  });
}

export function useRestoreFromCloud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await restoreFromCloud();
      // Bring the restored DB up to the current schema before any query
      // runs against it — backups from older app versions would otherwise
      // crash queries that expect new columns.
      await initDB();
    },
    onSuccess: () => {
      // Restored DB has different rows for every key — safer to blow the
      // whole cache than to maintain an allowlist that rots as new
      // queries are added.
      queryClient.invalidateQueries();
    },
  });
}

export function useExportDatabase() {
  return useMutation({
    mutationFn: exportDatabase,
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.EXPORT_TRIGGERED);
    },
  });
}

export function useImportDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importDatabase,
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.IMPORT_TRIGGERED);
      queryClient.invalidateQueries();
    },
  });
}

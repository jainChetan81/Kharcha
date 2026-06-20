import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDeviceSyncActive } from "@/hooks/use-feature-flags";
import { useDeviceSync, useDeviceSyncConfig } from "@/hooks/use-sync";
import { useGoogleAuth } from "@/lib/gmail/auth";
import { syncGmailTransactions } from "@/lib/gmail/sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function useRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  }, [queryClient]);

  return { refreshing, onRefresh };
}

export function useSyncRefresh() {
  const queryClient = useQueryClient();
  const { isConnected } = useGoogleAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const deviceSyncActive = useDeviceSyncActive();
  const { data: syncConfig } = useDeviceSyncConfig();
  const deviceSyncMutation = useDeviceSync();

  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, [isConnected]);

  const deviceSyncable = deviceSyncActive && !!syncConfig?.forwardingEmail;
  const lastSyncedAt = syncConfig?.lastSyncedAt;

  const inFlight = useRef(false);
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const tasks: Promise<void>[] = [];

      if (gmailConnected) {
        tasks.push(
          (async () => {
            try {
              const result = await syncGmailTransactions();
              if (result.nobanks) {
                showErrorToast(
                  "No active banks",
                  "Add a bank in settings to sync",
                );
              } else if (result.added > 0) {
                const parts = [`${result.added} added`];
                if (result.skipped > 0)
                  parts.push(`${result.skipped} duplicates`);
                if (result.failed > 0) parts.push(`${result.failed} failed`);
                showSuccessToast("Gmail synced", parts.join(" · "));
              }
            } catch (err) {
              showErrorToast("Gmail sync failed", err);
            }
          })(),
        );
      }

      if (deviceSyncable) {
        tasks.push(
          (async () => {
            try {
              const syncFromDate = lastSyncedAt
                ? new Date(lastSyncedAt)
                : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
              const result = await deviceSyncMutation.mutateAsync(syncFromDate);
              if (result.inserted > 0) {
                showSuccessToast("Device synced", `${result.inserted} added`);
              }
            } catch (err) {
              showErrorToast("Device sync failed", err);
            }
          })(),
        );
      }

      await Promise.all(tasks);
      await queryClient.invalidateQueries();
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [
    queryClient,
    gmailConnected,
    deviceSyncable,
    lastSyncedAt,
    deviceSyncMutation,
  ]);

  return { refreshing, onRefresh, gmailConnected };
}

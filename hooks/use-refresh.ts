import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
import { useMiniSync, useMiniSyncConfig } from "@/hooks/use-mini-sync";
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

export function formatMiniSyncResult(result: {
  added: number;
  skipped: number;
  failed: number;
}): string {
  const parts = [`${result.added} added`];
  if (result.skipped > 0) parts.push(`${result.skipped} duplicates`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}

export function useSyncRefresh() {
  const queryClient = useQueryClient();
  const { isConnected } = useGoogleAuth();
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const { enabled: miniSyncEnabled } = useMiniSyncConfig();
  const miniSync = useMiniSync();
  const [refreshing, setRefreshing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, [isConnected]);

  // Default true while the query is still loading, matching
  // readAutoRefreshPrefs' "unset = on" semantics.
  const gmailAutoSyncEnabled = autoRefreshPrefs?.gmail ?? true;

  const inFlight = useRef(false);
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const tasks: Promise<void>[] = [];

      if (gmailConnected && gmailAutoSyncEnabled) {
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
                showSuccessToast("Gmail synced", formatMiniSyncResult(result));
              }
            } catch (err) {
              showErrorToast("Gmail sync failed", err);
            }
          })(),
        );
      }

      if (miniSyncEnabled) {
        tasks.push(
          (async () => {
            try {
              const result = await miniSync.mutateAsync();
              if (result.result.added > 0) {
                showSuccessToast(
                  "Mini synced",
                  formatMiniSyncResult(result.result),
                );
              } else if (result.result.failed > 0) {
                // Every processable row failed this run — added stayed 0 so
                // the success branch above never fires. Without this, a
                // fully-failed sync produced no user-visible signal at all
                // on the one path meant to surface it.
                showErrorToast(
                  "Mini sync issues",
                  formatMiniSyncResult(result.result),
                );
              }
            } catch (err) {
              showErrorToast("Mini sync failed", err);
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
    gmailAutoSyncEnabled,
    miniSyncEnabled,
    miniSync,
  ]);

  return { refreshing, onRefresh, gmailConnected };
}

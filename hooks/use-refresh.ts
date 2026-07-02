import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, [isConnected]);

  const inFlight = useRef(false);
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      if (gmailConnected) {
        try {
          const result = await syncGmailTransactions();
          if (result.nobanks) {
            showErrorToast("No active banks", "Add a bank in settings to sync");
          } else if (result.added > 0) {
            const parts = [`${result.added} added`];
            if (result.skipped > 0) parts.push(`${result.skipped} duplicates`);
            if (result.failed > 0) parts.push(`${result.failed} failed`);
            showSuccessToast("Gmail synced", parts.join(" · "));
          }
        } catch (err) {
          showErrorToast("Gmail sync failed", err);
        }
      }

      await queryClient.invalidateQueries();
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [queryClient, gmailConnected]);

  return { refreshing, onRefresh, gmailConnected };
}

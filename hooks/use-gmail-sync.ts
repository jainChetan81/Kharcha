import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { deleteConfig, getConfig, updateConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { syncGmailTransactions } from "@/lib/gmail/sync";

export function useGmailSyncConfig() {
  const updateSyncFromDate = async (date: Date): Promise<void> => {
    await updateConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT, date.toISOString());
  };

  const disconnect = async (): Promise<void> => {
    await Promise.all([
      deleteConfig(CONFIG_KEYS.GMAIL_CONNECTED),
      deleteConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT),
      deleteConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED),
      deleteConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED),
    ]);
  };

  return {
    updateSyncFromDate,
    disconnect,
  };
}

export function useGmailSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_STARTED);
      const result = await syncGmailTransactions();

      if (result.nobanks) {
        throw new Error("No active banks");
      }

      const newFetched = String(
        Number((await getConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED)) ?? "0") +
          result.added +
          result.skipped +
          result.failed,
      );
      const newAdded = String(
        Number((await getConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED)) ?? "0") +
          result.added,
      );

      await Promise.all([
        updateConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED, newFetched),
        updateConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED, newAdded),
      ]);

      return { result, newFetched, newAdded };
    },
    onSuccess: (data) => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_COMPLETED, {
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
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_FAILED);
    },
  });
}

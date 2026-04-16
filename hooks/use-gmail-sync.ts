import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { deleteConfig, getConfig, updateConfig } from "@/lib/db/config";
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
    onSuccess: () => {
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
    },
  });
}

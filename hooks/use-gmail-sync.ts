import { useMutation } from "@tanstack/react-query";
import { useInvalidateTransactions } from "@/hooks/use-transactions";
import { CONFIG_KEYS } from "@/lib/constants";
import { deleteConfig, updateConfig } from "@/lib/db/config";
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
    ]);
  };

  return {
    updateSyncFromDate,
    disconnect,
  };
}

export function useGmailSync() {
  const invalidateTransactions = useInvalidateTransactions();

  return useMutation({
    mutationFn: async () => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_STARTED);
      const result = await syncGmailTransactions();

      if (result.nobanks) {
        throw new Error("No active banks");
      }

      return { result };
    },
    onSuccess: (data) => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_COMPLETED, {
        count: String(data.result.added),
      });
      invalidateTransactions();
    },
    onError: () => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_FAILED);
    },
  });
}

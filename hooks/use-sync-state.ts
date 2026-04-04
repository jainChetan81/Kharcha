import { useCallback, useEffect, useState } from "react";
import { CONFIG_KEYS } from "@/lib/constants";
import { getConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";

export function useSyncState() {
  const { isConnected } = useGoogleAuth();
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [emailsFetched, setEmailsFetched] = useState<string | null>(null);
  const [transactionsAdded, setTransactionsAdded] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [syncFromDate, setSyncFromDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: isConnected is stable from hook
  const loadState = useCallback(async () => {
    const [isConn, synced, fetched, added] = await Promise.all([
      isConnected(),
      getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT),
      getConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED),
      getConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED),
    ]);
    setConnected(isConn);
    setLastSynced(synced);
    setEmailsFetched(fetched);
    setTransactionsAdded(added);
    if (synced) {
      setSyncFromDate(new Date(synced));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  return {
    connected,
    setConnected,
    lastSynced,
    setLastSynced,
    emailsFetched,
    setEmailsFetched,
    transactionsAdded,
    setTransactionsAdded,
    loading,
    syncFromDate,
    setSyncFromDate,
    reload: loadState,
  };
}

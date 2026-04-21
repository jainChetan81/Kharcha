import { subMonths } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { CONFIG_KEYS, GMAIL_SYNC_MAX_MONTHS_BACK } from "@/lib/constants";
import { deleteConfig, getConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";
import { showErrorToast } from "@/lib/toast";

export function useSyncState() {
  const { isConnected, getValidAccessToken, signOut } = useGoogleAuth();
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncFromDate, setSyncFromDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: auth fns are stable from hook
  const loadState = useCallback(async () => {
    const [isConn, synced] = await Promise.all([
      isConnected(),
      getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT),
    ]);

    if (isConn) {
      const token = await getValidAccessToken();
      if (!token) {
        await signOut();
        await Promise.all([
          deleteConfig(CONFIG_KEYS.GMAIL_CONNECTED),
          deleteConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT),
        ]);
        setConnected(false);
        setLoading(false);
        showErrorToast("Session expired", "Please reconnect your Gmail");
        return;
      }
    }

    setConnected(isConn);
    setLastSynced(synced);
    if (synced) {
      const stored = new Date(synced);
      const floor = subMonths(new Date(), GMAIL_SYNC_MAX_MONTHS_BACK);
      setSyncFromDate(stored.getTime() < floor.getTime() ? floor : stored);
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
    loading,
    syncFromDate,
    setSyncFromDate,
    reload: loadState,
  };
}

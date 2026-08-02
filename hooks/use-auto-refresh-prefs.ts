import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOL_FLAG, CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";

export type AutoRefreshPrefs = {
  gmail: boolean;
};

export async function readAutoRefreshPrefs(): Promise<AutoRefreshPrefs> {
  const gmail = await getConfig(CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED);
  return {
    // Default to enabled when the user has never touched the toggle (same
    // pattern as useMiniSyncConfig). The config key is never seeded
    // anywhere else, so an "unset = off" read would silently disable Gmail
    // auto-sync on pull-to-refresh for every existing user the moment this
    // preference starts being consulted for real.
    gmail: gmail !== BOOL_FLAG.OFF,
  };
}

export function useAutoRefreshPrefs() {
  return useQuery({
    queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
    queryFn: readAutoRefreshPrefs,
  });
}

export function useSetAutoRefreshPref() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await updateConfig(
        CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED,
        enabled ? BOOL_FLAG.ON : BOOL_FLAG.OFF,
      );
      logEvent(FIREBASE_EVENTS.SYNC_PREF_TOGGLED, {
        enabled: enabled ? 1 : 0,
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
      }),
  });
}

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
    gmail: gmail === BOOL_FLAG.ON,
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
    mutationFn: async ({
      key,
      enabled,
    }: {
      key: "gmail";
      enabled: boolean;
    }) => {
      await updateConfig(
        CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED,
        enabled ? BOOL_FLAG.ON : BOOL_FLAG.OFF,
      );
      logEvent(FIREBASE_EVENTS.SYNC_PREF_TOGGLED, {
        key,
        enabled: enabled ? 1 : 0,
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
      }),
  });
}

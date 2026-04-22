import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SmsListener from "sms-notification-listener";
import { BOOL_FLAG, CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";

export type AutoRefreshPrefs = {
  gmail: boolean;
  device: boolean;
  sms: boolean;
  sms_listener: boolean;
};

export async function readAutoRefreshPrefs(): Promise<AutoRefreshPrefs> {
  const [gmail, device, sms, smsListener] = await Promise.all([
    getConfig(CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED),
    getConfig(CONFIG_KEYS.DEVICE_SYNC_USER_ENABLED),
    getConfig(CONFIG_KEYS.SMS_SYNC_USER_ENABLED),
    getConfig(CONFIG_KEYS.SMS_LISTENER_USER_ENABLED),
  ]);
  return {
    gmail: gmail === BOOL_FLAG.ON,
    device: device === BOOL_FLAG.ON,
    // Default ON — SMS sync opts in by default on Android; user can disable
    // from /sms-sync. Opposite of gmail/device which are opt-in.
    sms: sms === null ? true : sms === BOOL_FLAG.ON,
    // Default OFF — requires notification access permission which the user
    // must grant in system settings; don't claim it silently.
    sms_listener: smsListener === BOOL_FLAG.ON,
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
      key: "gmail" | "device" | "sms" | "sms_listener";
      enabled: boolean;
    }) => {
      const configKey =
        key === "gmail"
          ? CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED
          : key === "device"
            ? CONFIG_KEYS.DEVICE_SYNC_USER_ENABLED
            : key === "sms"
              ? CONFIG_KEYS.SMS_SYNC_USER_ENABLED
              : CONFIG_KEYS.SMS_LISTENER_USER_ENABLED;
      await updateConfig(configKey, enabled ? BOOL_FLAG.ON : BOOL_FLAG.OFF);
      if (key === "sms_listener") {
        SmsListener.setListenerEnabled(enabled);
      }
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

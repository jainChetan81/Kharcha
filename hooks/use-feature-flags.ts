import { useQuery } from "@tanstack/react-query";
import { useAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
import { QUERY_KEYS } from "@/lib/constants";
import { apiFetchAuthed } from "@/lib/device";
import { env } from "@/lib/env";
import { isAndroid } from "@/lib/utils";

type FeatureFlags = {
  gmail_sync_enabled: boolean;
  device_sync_enabled: boolean;
  sms_sync_enabled: boolean;
  sms_listener_enabled: boolean;
  name: string | null;
};

const DEFAULT_FLAGS: FeatureFlags = {
  gmail_sync_enabled: false,
  device_sync_enabled: false,
  // Default ON — the SMS share-target is low-risk (zero permissions, user
  // initiates the share) so we don't gate it behind server enablement.
  // Server can flip to false to hide the entry if needed.
  sms_sync_enabled: true,
  sms_listener_enabled: false,
  name: null,
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: [QUERY_KEYS.FEATURE_FLAGS],
    queryFn: async () => {
      const res = await apiFetchAuthed(`${env.API_URL}/feature-flags`);
      if (!res.ok) throw new Error("Failed to fetch feature flags");
      return res.json() as Promise<FeatureFlags>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  const { data } = useFeatureFlags();
  return data?.[key] ?? DEFAULT_FLAGS[key];
}

export function useGmailSyncEnabled(): boolean {
  return useFlag("gmail_sync_enabled");
}

export function useDeviceSyncEnabled(): boolean {
  return useFlag("device_sync_enabled");
}

export function useSmsSyncEnabled(): boolean {
  return useFlag("sms_sync_enabled") && isAndroid;
}

export function useSmsListenerEnabled(): boolean {
  return useFlag("sms_listener_enabled") && isAndroid;
}

export function useGmailSyncActive(): boolean {
  const flag = useGmailSyncEnabled();
  const { data } = useAutoRefreshPrefs();
  return flag && !!data?.gmail;
}

export function useDeviceSyncActive(): boolean {
  const flag = useDeviceSyncEnabled();
  const { data } = useAutoRefreshPrefs();
  return flag && !!data?.device;
}

export function useSmsSyncActive(): boolean {
  const flag = useSmsSyncEnabled();
  const { data } = useAutoRefreshPrefs();
  return flag && !!data?.sms;
}

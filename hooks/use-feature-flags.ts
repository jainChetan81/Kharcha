import { useQuery } from "@tanstack/react-query";
import { useAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig } from "@/lib/db/config";
import { env } from "@/lib/env";
import { apiFetch } from "@/lib/firebase/api-fetch";

type FeatureFlags = {
  gmail_sync_enabled: boolean;
  device_sync_enabled: boolean;
  name: string | null;
};

const DEFAULT_FLAGS: FeatureFlags = {
  gmail_sync_enabled: false,
  device_sync_enabled: false,
  name: null,
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: [QUERY_KEYS.FEATURE_FLAGS],
    queryFn: async () => {
      const deviceId = await getConfig(CONFIG_KEYS.DEVICE_ID);
      if (!deviceId) throw new Error("Device ID not found");

      const res = await apiFetch(`${env.API_URL}/feature-flags`, {
        headers: { "x-device-id": deviceId },
      });
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

import { useQuery } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig } from "@/lib/db/config";
import { env } from "@/lib/env";

type FeatureFlags = {
  gmail_sync_enabled: boolean;
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: [QUERY_KEYS.FEATURE_FLAGS],
    queryFn: async () => {
      const deviceId = await getConfig(CONFIG_KEYS.DEVICE_ID);
      if (!deviceId) throw new Error("Device ID not found");

      const res = await fetch(`${env.API_URL}/feature-flags`, {
        headers: { "x-device-id": deviceId },
      });
      if (!res.ok) throw new Error("Failed to fetch feature flags");
      return res.json() as Promise<FeatureFlags>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useGmailSyncEnabled(): boolean {
  const { data } = useFeatureFlags();
  return data?.gmail_sync_enabled ?? false;
}

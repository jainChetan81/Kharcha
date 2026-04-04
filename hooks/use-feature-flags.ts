import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { env } from "@/lib/env";

type FeatureFlags = {
  gmail_sync_enabled_for: string[];
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: [QUERY_KEYS.FEATURE_FLAGS],
    queryFn: async () => {
      const res = await fetch(`${env.API_URL}/feature-flags`);
      if (!res.ok) throw new Error("Failed to fetch feature flags");
      return res.json() as Promise<FeatureFlags>;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useGmailSyncEnabled(userName: string): boolean {
  const { data } = useFeatureFlags();
  return data?.gmail_sync_enabled_for?.includes(userName) ?? false;
}

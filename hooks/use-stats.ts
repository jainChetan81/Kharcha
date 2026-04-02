import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { getDataStats } from "@/lib/db";

export function useDataStats() {
  return useQuery({
    queryKey: [QUERY_KEYS.DATA_STATS],
    queryFn: getDataStats,
  });
}

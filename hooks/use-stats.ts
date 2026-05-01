import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { getDailySpend, getDataStats } from "@/lib/db";

export function useDataStats() {
  return useQuery({
    queryKey: [QUERY_KEYS.DATA_STATS],
    queryFn: getDataStats,
  });
}

export function useDailySpend(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.DAILY_SPEND, dateFrom, dateTo],
    queryFn: () => getDailySpend(dateFrom, dateTo),
  });
}

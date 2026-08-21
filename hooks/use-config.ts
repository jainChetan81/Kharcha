import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getAllConfig, updateConfig } from "@/lib/db/config";
import { CURRENCIES, type CurrencyCode } from "@/lib/format";

export { CURRENCIES, type CurrencyCode };

export function useConfig() {
  const queryClient = useQueryClient();

  const { data: raw } = useQuery({
    queryKey: [QUERY_KEYS.CONFIG],
    queryFn: getAllConfig,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateConfig(key, value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONFIG] }),
  });

  // SAFETY: currency is written only via the currency picker (CurrencyCode) or the "INR" seed.
  const currency = (raw?.[CONFIG_KEYS.CURRENCY] ?? "INR") as CurrencyCode;
  const userName = raw?.[CONFIG_KEYS.USER_NAME] ?? "User";

  return {
    currency,
    userName,
    updateCurrency: (code: CurrencyCode) =>
      mutation.mutateAsync({ key: CONFIG_KEYS.CURRENCY, value: code }),
    updateUserName: (name: string) =>
      mutation.mutateAsync({ key: CONFIG_KEYS.USER_NAME, value: name }),
  };
}

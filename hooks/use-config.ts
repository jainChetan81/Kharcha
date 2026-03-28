import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { getAllConfig, updateConfig } from "@/lib/db/config";

export type CurrencyCode = "INR" | "USD" | "GBP" | "EUR";

export const CURRENCIES: Record<
  CurrencyCode,
  { symbol: string; name: string; locale: string }
> = {
  INR: { symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
  USD: { symbol: "$", name: "US Dollar", locale: "en-US" },
  GBP: { symbol: "£", name: "British Pound", locale: "en-GB" },
  EUR: { symbol: "€", name: "Euro", locale: "de-DE" },
};

export type AppConfig = {
  currency: CurrencyCode;
  userName: string;
};

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

  const currency = (raw?.currency ?? "INR") as CurrencyCode;
  const userName = raw?.userName ?? "User";

  return {
    currency,
    userName,
    updateCurrency: (code: CurrencyCode) =>
      mutation.mutateAsync({ key: "currency", value: code }),
    updateUserName: (name: string) =>
      mutation.mutateAsync({ key: "userName", value: name }),
  };
}

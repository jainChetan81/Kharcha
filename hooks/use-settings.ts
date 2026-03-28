import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import { getAllSettings, updateSetting } from "@/lib/db/settings";

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

export function useSettings() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS],
    queryFn: getAllSettings,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SETTINGS] }),
  });

  const currency = (settings?.currency ?? "INR") as CurrencyCode;
  const userName = settings?.userName ?? "User";

  return {
    currency,
    userName,
    updateCurrency: (code: CurrencyCode) =>
      mutation.mutateAsync({ key: "currency", value: code }),
    updateUserName: (name: string) =>
      mutation.mutateAsync({ key: "userName", value: name }),
  };
}

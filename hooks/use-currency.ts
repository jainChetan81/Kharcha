import { useCallback } from "react";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";

export function useCurrency() {
  const { currency } = useSettings();
  const format = useCallback(
    (amount: number) => formatCurrency(amount, currency),
    [currency],
  );
  return { currency, format };
}

import { useCallback } from "react";
import { useConfig } from "@/hooks/use-config";
import { formatCurrency } from "@/lib/format";

export function useCurrency() {
  const { currency } = useConfig();
  const format = useCallback(
    (amount: number) => formatCurrency(amount, currency),
    [currency],
  );
  return { currency, format };
}

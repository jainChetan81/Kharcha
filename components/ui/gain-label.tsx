import { TrendingDown, TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

type GainLabelVariant = "pill" | "text" | "right-aligned";

/**
 * Renders an unrealized P&L value with matching sign, color, and optional
 * percentage. Used on the portfolio list row, detail header, and home tile —
 * consolidating so the sign/color/`toFixed(1)` formatting stays consistent.
 */
export function GainLabel({
  amount,
  pct,
  variant = "text",
  showAmount = true,
  extraText,
}: {
  amount: number;
  pct?: number;
  variant?: GainLabelVariant;
  showAmount?: boolean;
  extraText?: string;
}) {
  const { format } = useCurrency();
  const isGain = amount >= 0;
  const sign = isGain ? "+" : "";
  const colorClass = isGain ? "text-positive" : "text-negative";
  const amountText = showAmount ? `${sign}${format(amount)}` : "";
  const pctText = pct != null ? ` (${pct.toFixed(1)}%)` : "";
  const suffix = extraText ? ` · ${extraText}` : "";

  if (variant === "pill") {
    return (
      <View
        className={cn(
          "flex-row items-center gap-1 rounded-full px-2.5 py-1",
          isGain ? "bg-positive/15" : "bg-negative/15",
        )}
      >
        <Icon
          as={isGain ? TrendingUp : TrendingDown}
          className={cn("size-3.5", colorClass)}
        />
        <Text className={cn("text-xs font-semibold", colorClass)}>
          {amountText}
          {pctText}
          {suffix}
        </Text>
      </View>
    );
  }

  if (variant === "right-aligned") {
    return (
      <Text className={cn("text-xs font-medium", colorClass)}>
        {showAmount ? amountText : `${sign}${(pct ?? 0).toFixed(1)}%`}
        {showAmount ? pctText : ""}
        {suffix}
      </Text>
    );
  }

  return (
    <Text className={cn("text-sm font-semibold", colorClass)}>
      {amountText}
      {pctText}
      {suffix}
    </Text>
  );
}

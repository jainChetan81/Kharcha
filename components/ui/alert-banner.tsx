import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type AlertTone = "warn" | "positive" | "negative" | "info";

export const ALERT_TONE_TEXT: Record<AlertTone, string> = {
  warn: "text-amber-500",
  positive: "text-positive",
  negative: "text-negative",
  info: "text-primary",
};

const TONE_BG: Record<AlertTone, string> = {
  warn: "bg-amber-600/10",
  positive: "bg-positive/10",
  negative: "bg-negative/10",
  info: "bg-primary/10",
};

const TONE_BORDER: Record<AlertTone, string> = {
  warn: "border-amber-600/40",
  positive: "border-positive/30",
  negative: "border-negative/30",
  info: "border-primary/30",
};

export function AlertBanner({
  tone,
  leadingIcon,
  onPress,
  children,
}: {
  tone: AlertTone;
  leadingIcon?: LucideIcon;
  onPress?: () => void;
  children: ReactNode;
}) {
  const toneText = ALERT_TONE_TEXT[tone];
  const content = (
    <>
      {leadingIcon && <Icon as={leadingIcon} className={toneText} size={16} />}
      <View className="flex-1">{children}</View>
      {onPress && <Icon as={ChevronRight} className={toneText} size={14} />}
    </>
  );

  const className = cn(
    "flex-row items-center gap-3 rounded-xl border px-4 py-3",
    TONE_BG[tone],
    TONE_BORDER[tone],
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={className}>
        {content}
      </Pressable>
    );
  }
  return <View className={className}>{content}</View>;
}

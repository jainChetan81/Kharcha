import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type IconButtonTone = "default" | "muted" | "primary" | "negative";
type IconButtonVariant = "ghost" | "card";

const TONE_CLASS = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary-text",
  negative: "text-negative-text",
} satisfies Record<IconButtonTone, string>;

type IconButtonProps = {
  icon: LucideIcon;
  onPress: () => void;
  /** Color tone applied to the icon. */
  tone?: IconButtonTone;
  /** "ghost" → tight padding, no border. "card" → bordered card with rounded background. */
  variant?: IconButtonVariant;
  disabled?: boolean;
  /** Extends touch target outside the visible button. */
  hitSlop?: number;
  /** Extra container classes (e.g. ml-2). */
  className?: string;
  accessibilityLabel?: string;
};

export function IconButton({
  icon,
  onPress,
  tone = "default",
  variant = "ghost",
  disabled,
  hitSlop = 8,
  className,
  accessibilityLabel,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      className={cn(
        variant === "ghost"
          ? "p-1.5"
          : "rounded-xl border border-border bg-card p-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <Icon as={icon} className={cn("size-4", TONE_CLASS[tone])} />
    </Pressable>
  );
}

import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type TagChipProps = {
  name: string;
  color: string | null;
  emoji: string | null;
  className?: string;
  /**
   * "sm" matches inline transaction-item chips; "md" is for tag list rows
   * and the active-scope card.
   */
  size?: "sm" | "md";
};

/**
 * Tag pill with optional color tint and emoji prefix. Falls back to brand
 * primary when no color is set so untouched tags still read as tags. The
 * tint hex is dynamic per-tag, so this is one of the rare places we need
 * inline `style` — NativeWind classes can't express user-defined hex.
 */
export function TagChip({
  name,
  color,
  emoji,
  className,
  size = "sm",
}: TagChipProps) {
  const tint = color ?? COLORS.PRIMARY;
  const isSmall = size === "sm";
  return (
    <View
      style={{
        backgroundColor: `${tint}26`,
        borderColor: `${tint}66`,
      }}
      className={cn(
        "flex-row items-center rounded-md border",
        isSmall ? "px-1.5 py-0.5" : "px-2.5 py-1",
        className,
      )}
    >
      {emoji ? (
        <Text className={cn("mr-1", isSmall ? "text-[10px]" : "text-xs")}>
          {emoji}
        </Text>
      ) : null}
      <Text
        style={{ color: tint }}
        className={cn("font-medium", isSmall ? "text-[10px]" : "text-xs")}
      >
        #{name}
      </Text>
    </View>
  );
}

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagChip } from "@/components/ui/tag-chip";
import { Text } from "@/components/ui/text";
import { COLORS, TAG_COLOR_PALETTE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type TagAppearanceSheetProps = {
  visible: boolean;
  onClose: () => void;
  tagName: string;
  initialColor: string | null;
  initialEmoji: string | null;
  onSave: (color: string | null, emoji: string | null) => void | Promise<void>;
};

/**
 * Pick a color tint and a single emoji prefix for a tag. Live preview at
 * the top so the user sees what their chip will look like before saving.
 * "None" is a valid choice for both — picking it clears the field.
 */
export function TagAppearanceSheet({
  visible,
  onClose,
  tagName,
  initialColor,
  initialEmoji,
  onSave,
}: TagAppearanceSheetProps) {
  const [color, setColor] = useState(initialColor);
  const [emoji, setEmoji] = useState(initialEmoji ?? "");

  // Re-seed when reopened with a different tag — without this, switching
  // tags from the list would show the previous tag's draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) {
      setColor(initialColor);
      setEmoji(initialEmoji ?? "");
    }
  }, [visible, tagName]);

  async function handleSave() {
    const trimmedEmoji = emoji.trim();
    await onSave(color, trimmedEmoji.length > 0 ? trimmedEmoji : null);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text className="mb-1 text-base font-bold text-foreground">
        Tag style
      </Text>
      <Text className="mb-4 text-xs text-muted-foreground">
        Pick a color and (optionally) an emoji prefix. Shows up on every chip
        for #{tagName}.
      </Text>

      <View className="mb-4 items-center">
        <TagChip
          name={tagName}
          color={color}
          emoji={emoji.trim() || null}
          size="md"
        />
      </View>

      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Color
      </Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="No color"
          accessibilityState={{ selected: color === null }}
          hitSlop={8}
          onPress={() => setColor(null)}
          className={cn(
            "h-9 w-9 items-center justify-center rounded-full border",
            color === null ? "border-foreground" : "border-border bg-card",
          )}
        >
          <Text className="text-[10px] text-muted-foreground">None</Text>
        </Pressable>
        {TAG_COLOR_PALETTE.map((swatch, index) => (
          <Pressable
            key={swatch}
            accessibilityRole="button"
            accessibilityLabel={`Color ${index + 1}`}
            accessibilityState={{ selected: color === swatch }}
            hitSlop={8}
            onPress={() => setColor(swatch)}
            style={{ backgroundColor: swatch }}
            className={cn(
              "h-9 w-9 rounded-full border-2",
              color === swatch ? "border-foreground" : "border-transparent",
            )}
          />
        ))}
      </View>

      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Emoji
      </Text>
      <Input
        accessibilityLabel="Emoji"
        value={emoji}
        onChangeText={setEmoji}
        placeholder="✈️"
        placeholderTextColor={COLORS.MUTED}
        maxLength={4}
        className="mb-4"
      />

      <Button
        onPress={handleSave}
        className="h-12 w-full rounded-xl bg-primary"
      >
        <Text className="text-base font-semibold text-primary-foreground">
          Save
        </Text>
      </Button>
    </BottomSheet>
  );
}

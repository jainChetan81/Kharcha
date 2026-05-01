import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import {
  DURATION_OPTIONS_DETAILED,
  type DurationKey,
} from "@/lib/tag-duration";

export { durationEnd } from "@/lib/tag-duration";

type QuickDurationSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Tag name being activated — shown in the title. */
  tagName: string;
  /** Called when the user picks a duration. Should start the scope and close. */
  onPick: (durationKey: DurationKey) => void;
};

/**
 * Tiny duration picker for the per-tag ⚡ button. No name input — the tag
 * already has one. Tap any duration row → scope starts immediately and the
 * sheet closes.
 */
export function QuickDurationSheet({
  visible,
  onClose,
  tagName,
  onPick,
}: QuickDurationSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-1 text-base font-bold text-foreground">
        Start #{tagName} for…
      </Text>
      <Text className="mb-4 text-xs text-muted-foreground">
        Pick how long the scope should run. New transactions auto-tag until it
        ends.
      </Text>

      <View className="gap-2">
        {DURATION_OPTIONS_DETAILED.map((d) => (
          <Pressable
            key={d.value}
            onPress={() => onPick(d.value)}
            className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <View>
              <Text className="text-sm font-medium text-foreground">
                {d.label}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {d.sub}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

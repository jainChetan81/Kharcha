import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const CHIP_SCROLL_STYLE = { gap: 8, paddingRight: 24 } as const;
const CHIP_HIT_SLOP = { top: 4, bottom: 4 } as const;

function hapticSelect() {
  Haptics.selectionAsync();
}

type ChipListItem = { id: number; name: string };

// Shared chip-row rendering for ChipPicker (single-select) and
// MultiChipPicker (multi-select) — both are the same ScrollView → Pressable
// → accessibilityState={{ selected }} → cn(...) chip structure, differing
// only in selection semantics (which the two exported components own) and
// what each chip's label reads (`getLabel`). `leading` lets ChipPicker
// prepend its "all" pseudo-chip inside the same ScrollView — it has
// different selection semantics (compares to `null`, not to any item) so it
// can't be expressed as just another item in `items`.
function ChipList<T extends ChipListItem>({
  items,
  isSelected,
  onToggle,
  getLabel = (item) => item.name,
  onAddNew,
  addLabel,
  leading,
}: {
  items: T[];
  isSelected: (item: T) => boolean;
  onToggle: (item: T) => void;
  getLabel?: (item: T) => string;
  onAddNew?: () => void;
  addLabel?: string;
  leading?: ReactNode;
}) {
  return (
    <View className="relative">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={CHIP_SCROLL_STYLE}
      >
        {leading}
        {items.map((item) => {
          const selected = isSelected(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                hapticSelect();
                onToggle(item);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={CHIP_HIT_SLOP}
              className={cn(
                "rounded-full px-4 py-3",
                selected ? "bg-primary" : "border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  selected
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {getLabel(item)}
              </Text>
            </Pressable>
          );
        })}
        {onAddNew && (
          <Pressable
            onPress={onAddNew}
            accessibilityRole="button"
            accessibilityLabel={`Add ${addLabel ?? "new"}`}
            hitSlop={CHIP_HIT_SLOP}
            className="rounded-full border border-dashed border-border bg-card px-4 py-3"
          >
            <Text className="text-sm font-medium text-primary-text">
              + {addLabel ?? "New"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

export function ChipPicker({
  items,
  selectedId,
  onSelect,
  allLabel,
  onAddNew,
  addLabel,
}: {
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  allLabel?: string;
  onAddNew?: () => void;
  addLabel?: string;
}) {
  return (
    <ChipList
      items={items}
      isSelected={(item) => selectedId === item.id}
      onToggle={(item) => onSelect(selectedId === item.id ? null : item.id)}
      onAddNew={onAddNew}
      addLabel={addLabel}
      leading={
        allLabel ? (
          <Pressable
            onPress={() => {
              hapticSelect();
              onSelect(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId === null }}
            hitSlop={CHIP_HIT_SLOP}
            className={cn(
              "rounded-full px-4 py-3",
              selectedId === null ? "bg-primary" : "bg-muted",
            )}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                selectedId === null
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {allLabel}
            </Text>
          </Pressable>
        ) : undefined
      }
    />
  );
}

export function MultiChipPicker({
  items,
  selectedIds,
  onChange,
  emptyLabel,
  onAddNew,
  addLabel,
}: {
  items: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyLabel?: string;
  onAddNew?: () => void;
  addLabel?: string;
}) {
  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (items.length === 0 && !onAddNew) {
    return (
      <Text className="text-sm text-muted-foreground">
        {emptyLabel ?? "No items yet"}
      </Text>
    );
  }

  return (
    <ChipList
      items={items}
      isSelected={(item) => selectedIds.includes(item.id)}
      onToggle={(item) => toggle(item.id)}
      getLabel={(item) => `#${item.name}`}
      onAddNew={onAddNew}
      addLabel={addLabel}
    />
  );
}

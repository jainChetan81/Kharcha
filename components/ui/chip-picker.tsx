import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const CHIP_SCROLL_STYLE = { gap: 8, paddingRight: 24 } as const;

function hapticSelect() {
  Haptics.selectionAsync();
}

export function ChipPicker({
  items,
  selectedId,
  onSelect,
  allLabel,
}: {
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  allLabel?: string;
}) {
  return (
    <View className="relative">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={CHIP_SCROLL_STYLE}
      >
        {allLabel && (
          <Pressable
            onPress={() => {
              hapticSelect();
              onSelect(null);
            }}
            className={cn(
              "rounded-full px-4 py-2.5",
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
        )}
        {items.map((item) => {
          const selected = selectedId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                hapticSelect();
                onSelect(selected ? null : item.id);
              }}
              className={cn(
                "rounded-full px-4 py-2.5",
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
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MultiChipPicker({
  items,
  selectedIds,
  onChange,
  emptyLabel,
  onAddNew,
}: {
  items: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyLabel?: string;
  onAddNew?: () => void;
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
    <View className="relative">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={CHIP_SCROLL_STYLE}
      >
        {items.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                hapticSelect();
                toggle(item.id);
              }}
              className={cn(
                "rounded-full px-4 py-2.5",
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
                #{item.name}
              </Text>
            </Pressable>
          );
        })}
        {onAddNew && (
          <Pressable
            onPress={onAddNew}
            className="rounded-full border border-dashed border-border bg-card px-4 py-2.5"
          >
            <Text className="text-sm font-medium text-primary">+ New tag</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

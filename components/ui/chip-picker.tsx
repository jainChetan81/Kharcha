import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

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
        contentContainerStyle={{ gap: 8, paddingRight: 24 }}
      >
        {allLabel && (
          <Pressable
            onPress={() => onSelect(null)}
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
              onPress={() => onSelect(selected ? null : item.id)}
              className={cn(
                "rounded-full px-4 py-2.5",
                selected ? "bg-primary" : "border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium capitalize",
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

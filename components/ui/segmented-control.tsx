import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-full bg-muted p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) Haptics.selectionAsync();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={cn(
              "min-h-11 flex-1 items-center justify-center rounded-full px-3 py-2",
              selected && "bg-primary",
            )}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                selected ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

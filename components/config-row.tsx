import { ChevronDown, ChevronUp, Lock, Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function ConfigRow({
  name,
  isDefault,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  name: string;
  isDefault: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-3 py-2">
      <Pressable
        onPress={onMoveUp}
        disabled={isFirst}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Move ${name} up`}
        accessibilityState={{ disabled: isFirst }}
        className={cn("p-1.5", isFirst && "opacity-30")}
      >
        <Icon as={ChevronUp} className="size-4 text-muted-foreground" />
      </Pressable>
      <Pressable
        onPress={onMoveDown}
        disabled={isLast}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Move ${name} down`}
        accessibilityState={{ disabled: isLast }}
        className={cn("p-1.5", isLast && "opacity-30")}
      >
        <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
      </Pressable>
      <Text className="ml-2 flex-1 text-sm font-medium text-foreground">
        {name}
      </Text>
      {isDefault ? (
        <Icon as={Lock} className="size-4 text-muted-foreground" />
      ) : (
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}
          className="p-1"
        >
          <Icon as={Trash2} className="size-4 text-negative-text" />
        </Pressable>
      )}
    </View>
  );
}

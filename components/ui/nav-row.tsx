import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function NavRow({
  icon,
  title,
  description,
  accessory,
  showChevron = true,
  onPress,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  accessory?: ReactNode;
  showChevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
    >
      {icon ? (
        <Icon as={icon} className="mr-3 size-4 text-muted-foreground" />
      ) : null}
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{title}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {accessory}
      {showChevron ? (
        <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
      ) : null}
    </Pressable>
  );
}

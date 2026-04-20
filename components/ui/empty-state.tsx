import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function EmptyState({
  icon,
  title,
  description,
  children,
  inList = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Set true when rendered as a FlatList/FlashList ListEmptyComponent. */
  inList?: boolean;
}) {
  return (
    <View
      className={
        inList ? "items-center pt-20" : "flex-1 items-center justify-center"
      }
    >
      <Icon as={icon} className="mb-3 size-12 text-muted-foreground" />
      <Text className="text-sm text-muted-foreground">{title}</Text>
      {description ? (
        <Text className="mt-1 px-8 text-center text-xs text-muted-foreground">
          {description}
        </Text>
      ) : null}
      {children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}

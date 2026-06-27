import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn, isIOS } from "@/lib/utils";

export function ScreenHeader({
  title,
  children,
  showBack = true,
}: {
  title: string;
  children?: React.ReactNode;
  showBack?: boolean;
}) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-between bg-background px-6 pb-4",
        isIOS ? "pt-[60px]" : "pt-12",
      )}
    >
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityHint="Goes back to the previous screen"
          hitSlop={8}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">{title}</Text>
        </Pressable>
      ) : (
        <Text className="text-lg font-bold text-foreground">{title}</Text>
      )}
      {children}
    </View>
  );
}

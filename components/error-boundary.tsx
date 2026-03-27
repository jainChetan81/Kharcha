import { router } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SCREENS } from "@/lib/constants";

export function ScreenError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Icon as={AlertTriangle} className="mb-4 size-12 text-negative" />
      <Text className="mb-2 text-base font-bold text-foreground">
        Something went wrong
      </Text>
      <Text className="mb-6 text-center text-sm text-muted-foreground">
        {error.message}
      </Text>
      <Pressable
        onPress={retry}
        className="mb-3 w-full items-center rounded-2xl bg-primary py-3"
      >
        <Text className="text-sm font-semibold text-primary-foreground">
          Try Again
        </Text>
      </Pressable>
      <Pressable
        onPress={() => router.replace(SCREENS.HOME)}
        className="w-full items-center rounded-2xl border border-border py-3"
      >
        <Text className="text-sm font-medium text-muted-foreground">
          Go Home
        </Text>
      </Pressable>
    </View>
  );
}

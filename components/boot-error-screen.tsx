import { AlertTriangle } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type BootErrorScreenProps = {
  error: Error;
  onRetry: () => void;
};

export function BootErrorScreen({ error, onRetry }: BootErrorScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <View className="mb-8 size-24 items-center justify-center rounded-full bg-card">
        <Icon as={AlertTriangle} className="size-10 text-negative-text" />
      </View>

      <Text className="mb-2 text-2xl font-bold text-foreground">
        Kharcha couldn't start
      </Text>
      <Text className="mb-10 text-center text-sm text-muted-foreground">
        {error.message || "Something went wrong while loading your data."}
      </Text>

      <Pressable
        onPress={onRetry}
        className="w-full items-center rounded-2xl bg-primary py-3"
      >
        <Text className="text-base font-semibold text-primary-foreground">
          Try Again
        </Text>
      </Pressable>
    </View>
  );
}

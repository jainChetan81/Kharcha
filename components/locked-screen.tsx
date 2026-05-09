import { Lock } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type LockedScreenProps = {
  onUnlock: () => void;
};

export function LockedScreen({ onUnlock }: LockedScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <View className="mb-8 size-24 items-center justify-center rounded-full bg-card">
        <Icon as={Lock} className="size-10 text-primary" />
      </View>

      <Text className="mb-2 text-2xl font-bold text-foreground">Kharcha</Text>
      <Text className="mb-10 text-sm text-muted-foreground">App is locked</Text>

      <Pressable onPress={onUnlock} className="rounded-xl bg-primary px-8 py-3">
        <Text className="text-base font-semibold text-primary-foreground">
          Unlock Kharcha
        </Text>
      </Pressable>
    </View>
  );
}

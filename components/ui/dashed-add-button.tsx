import { Plus } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export function DashedAddButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
    >
      <Icon as={Plus} className="size-4 text-primary-text" />
      <Text className="text-sm font-medium text-primary-text">{label}</Text>
    </Pressable>
  );
}

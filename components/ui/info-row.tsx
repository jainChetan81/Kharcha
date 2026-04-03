import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <Text className="text-sm text-muted-foreground">{value ?? "—"}</Text>
    </View>
  );
}

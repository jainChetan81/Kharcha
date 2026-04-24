import * as Haptics from "expo-haptics";
import { Switch, View } from "react-native";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          Haptics.selectionAsync();
          onValueChange(next);
        }}
        disabled={disabled}
        trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
        thumbColor={COLORS.WHITE}
      />
    </View>
  );
}

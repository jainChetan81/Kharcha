import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function StepCard({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-card p-3">
      <View className="mb-2 h-6 w-6 items-center justify-center rounded-full bg-primary">
        <Text className="text-xs font-bold text-primary-foreground">
          {step}
        </Text>
      </View>
      <Text className="mb-1 text-xs font-semibold text-foreground">
        {title}
      </Text>
      <Text className="text-[11px] leading-4 text-muted-foreground">
        {body}
      </Text>
    </View>
  );
}

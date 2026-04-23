import { X } from "lucide-react-native";
import { Modal, Pressable, View } from "react-native";
import { HistoryInsightsStrip } from "@/components/history-insights-strip";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import type { FilteredInsights } from "@/hooks/use-transactions";

export function HistorySummarySheet({
  visible,
  onClose,
  insights,
}: {
  visible: boolean;
  onClose: () => void;
  insights: FilteredInsights | undefined;
}) {
  const { format: fmt } = useCurrency();
  if (!insights) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="rounded-t-3xl bg-background p-6 pb-12">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">Summary</Text>
            <Pressable onPress={onClose} className="rounded-full bg-card p-2">
              <Icon as={X} className="size-5 text-muted-foreground" />
            </Pressable>
          </View>
          <HistoryInsightsStrip insights={insights} fmt={fmt} />
        </View>
      </View>
    </Modal>
  );
}

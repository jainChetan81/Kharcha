import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";

type DuplicateTransactionSheetProps = {
  visible: boolean;
  amount: string;
  merchant: string;
  date: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DuplicateTransactionSheet({
  visible,
  amount,
  merchant,
  date,
  onConfirm,
  onCancel,
}: DuplicateTransactionSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <Text className="mb-2 text-base font-bold text-foreground">
        Possible Duplicate
      </Text>
      <Text className="mb-6 text-sm text-muted-foreground">
        A transaction for {amount} at {merchant} already exists on {date}. Add
        anyway?
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center rounded-xl py-3"
          onPress={onCancel}
        >
          <Text className="text-sm font-medium" style={{ color: "#888888" }}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-xl py-3"
          style={{ backgroundColor: "#7c3aed" }}
          onPress={onConfirm}
        >
          <Text className="text-sm font-semibold text-white">Add Anyway</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

import { useState } from "react";
import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

export function AddItemSheet({
  visible,
  onClose,
  title,
  placeholder,
  submitLabel,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  submitLabel: string;
  onAdd: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");

  function handleClose() {
    setValue("");
    onClose();
  }

  async function handleAdd() {
    const trimmed = value.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setValue("");
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} avoidKeyboard>
      <Text className="mb-4 text-base font-bold text-foreground">{title}</Text>
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={setValue}
        placeholderTextColor={COLORS.MUTED}
        autoFocus
      />
      <View className={cn("mt-4 flex-row items-center gap-3", isIOS && "mb-4")}>
        <Pressable onPress={handleClose} className="flex-1 items-center py-3">
          <Text className="text-sm font-medium text-muted-foreground">
            Cancel
          </Text>
        </Pressable>
        <Button
          className="flex-1 h-12 rounded-2xl bg-primary"
          onPress={handleAdd}
          disabled={!value.trim()}
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {submitLabel}
          </Text>
        </Button>
      </View>
    </BottomSheet>
  );
}

import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Text } from "@/components/ui/text";
import { CURRENCIES, type CurrencyCode } from "@/hooks/use-config";
import { cn, isIOS } from "@/lib/utils";

export function CurrencyPicker({
  visible,
  onClose,
  selected,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selected: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-4 text-base font-bold text-foreground">
        Select Currency
      </Text>
      {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
        <Pressable
          key={code}
          onPress={() => onSelect(code)}
          className="flex-row items-center rounded-xl px-4 py-3"
        >
          <Text className="w-8 text-base font-bold text-foreground">
            {CURRENCIES[code].symbol}
          </Text>
          <Text className="flex-1 text-sm text-foreground">
            {code} — {CURRENCIES[code].name}
          </Text>
          {selected === code && (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs text-primary-foreground">✓</Text>
            </View>
          )}
        </Pressable>
      ))}
      <Pressable
        onPress={onClose}
        className={cn("mt-3 items-center py-2", isIOS && "mb-4")}
      >
        <Text className="text-sm font-medium text-muted-foreground">
          Cancel
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

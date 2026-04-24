import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  COLORS,
  INSTRUMENT_LABEL,
  INSTRUMENT_TYPE,
  type InstrumentTypeType,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const INSTRUMENT_OPTIONS: InstrumentTypeType[] = [
  INSTRUMENT_TYPE.MUTUAL_FUND,
  INSTRUMENT_TYPE.STOCK,
  INSTRUMENT_TYPE.ETF,
  INSTRUMENT_TYPE.FD,
  INSTRUMENT_TYPE.GOLD,
  INSTRUMENT_TYPE.CRYPTO,
  INSTRUMENT_TYPE.BOND,
  INSTRUMENT_TYPE.OTHER,
];

interface AddHoldingSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, instrumentType: InstrumentTypeType) => Promise<void>;
  defaultInstrumentType?: InstrumentTypeType;
}

export default function AddHoldingSheet({
  visible,
  onClose,
  onSave,
  defaultInstrumentType = INSTRUMENT_TYPE.MUTUAL_FUND,
}: AddHoldingSheetProps) {
  const [name, setName] = useState("");
  const [instrumentType, setInstrumentType] = useState<InstrumentTypeType>(
    defaultInstrumentType,
  );

  // Reset draft each time the sheet opens — otherwise a user who starts
  // typing, cancels, and reopens sees stale name/instrument from the prior
  // session. Matches the BottomSheet form-mode reset behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) {
      setName("");
      setInstrumentType(defaultInstrumentType);
    }
  }, [visible]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSave(trimmed, instrumentType);
    setName("");
    setInstrumentType(defaultInstrumentType);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text className="mb-4 text-base font-bold text-foreground">
        Add Holding
      </Text>
      <Input
        placeholder="e.g. Nippon Small Cap, NIFTYBEES"
        value={name}
        onChangeText={setName}
        placeholderTextColor={COLORS.MUTED}
        autoFocus
      />
      <Text className="mb-2 mt-4 text-xs font-medium text-muted-foreground">
        Instrument type
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {INSTRUMENT_OPTIONS.map((opt) => {
          const selected = instrumentType === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => setInstrumentType(opt)}
              className={cn(
                "rounded-full px-4 py-2",
                selected ? "bg-primary" : "border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  selected
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {INSTRUMENT_LABEL[opt]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="mt-5 flex-row gap-3">
        <Button
          variant="outline"
          className="h-12 flex-1 rounded-xl border-border"
          onPress={onClose}
        >
          <Text className="text-sm font-medium text-muted-foreground">
            Cancel
          </Text>
        </Button>
        <Button
          className="h-12 flex-1 rounded-xl bg-primary"
          onPress={handleSubmit}
          disabled={!name.trim()}
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            Add Holding
          </Text>
        </Button>
      </View>
    </BottomSheet>
  );
}

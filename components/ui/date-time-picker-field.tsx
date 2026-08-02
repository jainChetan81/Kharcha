import { format, parse } from "date-fns";
import { Calendar } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { DateTimePickerModal } from "@/components/ui/date-picker-modal";
import { FormLabel } from "@/components/ui/form-label";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { DATE_DISPLAY_FORMAT, DATE_TIME_FORMAT } from "@/lib/constants";

type DateTimePickerFieldProps = {
  label: string;
  /** Selected datetime string in `YYYY-MM-DD HH:mm` form, or null. */
  value: string | null;
  onChange: (value: string) => void;
  /** Disallows selections before this datetime (same string format). */
  minValue?: string | null;
  placeholder?: string;
  /** Notifies the parent when the picker modal opens/closes (e.g. to hide a parent BottomSheet). */
  onPickerVisibilityChange?: (open: boolean) => void;
};

export function DateTimePickerField({
  label,
  value,
  onChange,
  minValue,
  placeholder = "Pick date & time",
  onPickerVisibilityChange,
}: DateTimePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  function setVisible(open: boolean) {
    setShowPicker(open);
    onPickerVisibilityChange?.(open);
  }

  // parse() returns an Invalid Date (not a throw) for a non-matching string;
  // format() then throws RangeError on it, so guard before formatting.
  const parsedValue = value ? parse(value, DATE_TIME_FORMAT, new Date()) : null;
  const validValue =
    parsedValue && !Number.isNaN(parsedValue.getTime()) ? parsedValue : null;

  return (
    <View>
      <FormLabel>{label}</FormLabel>
      <Pressable
        onPress={() => setVisible(true)}
        className="flex-row items-center rounded-xl border border-border bg-background p-3"
      >
        <Icon as={Calendar} className="mr-2 size-4 text-muted-foreground" />
        <Text
          className={
            value ? "text-xs text-foreground" : "text-xs text-muted-foreground"
          }
        >
          {validValue ? format(validValue, DATE_DISPLAY_FORMAT) : placeholder}
        </Text>
      </Pressable>
      <DateTimePickerModal
        visible={showPicker}
        value={validValue ?? new Date()}
        minimumDate={
          minValue ? parse(minValue, DATE_TIME_FORMAT, new Date()) : undefined
        }
        onConfirm={(date) => {
          setVisible(false);
          onChange(format(date, DATE_TIME_FORMAT));
        }}
        onCancel={() => setVisible(false)}
      />
    </View>
  );
}

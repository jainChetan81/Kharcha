import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { DATE_FORMAT, TIME_FORMAT } from "@/lib/constants";

const DatePickerModal = lazy(() =>
  import("./date-picker-modal").then((m) => ({ default: m.DatePickerModal })),
);
const TimePickerModal = lazy(() =>
  import("./date-picker-modal").then((m) => ({ default: m.TimePickerModal })),
);

export function DateTimePickerRow({
  label,
  value,
  minimumDate,
  maximumDate,
  dateTitle,
  onChange,
}: {
  label: string;
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  dateTitle?: string;
  onChange: (next: Date) => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  return (
    <>
      <View className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3">
        <Text className="mb-2 text-sm font-medium text-foreground">
          {label}
        </Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Date: ${format(value, DATE_FORMAT)}`}
            accessibilityHint="Opens the date picker"
            hitSlop={8}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-background px-3 py-2"
          >
            <Icon as={Calendar} className="size-4 text-primary-text" />
            <Text className="text-sm text-primary-text">
              {format(value, DATE_FORMAT)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowTimePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Time: ${format(value, TIME_FORMAT)}`}
            accessibilityHint="Opens the time picker"
            hitSlop={8}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-background px-3 py-2"
          >
            <Icon as={Clock} className="size-4 text-primary-text" />
            <Text className="text-sm text-primary-text">
              {format(value, TIME_FORMAT)}
            </Text>
          </Pressable>
        </View>
      </View>
      <Suspense fallback={null}>
        <DatePickerModal
          visible={showDatePicker}
          value={value}
          title={dateTitle}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onConfirm={(date) => {
            setShowDatePicker(false);
            const merged = new Date(value);
            merged.setFullYear(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
            );
            onChange(merged);
          }}
          onCancel={() => setShowDatePicker(false)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <TimePickerModal
          visible={showTimePicker}
          value={value}
          onConfirm={(date) => {
            setShowTimePicker(false);
            const merged = new Date(value);
            merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
            onChange(merged);
          }}
          onCancel={() => setShowTimePicker(false)}
        />
      </Suspense>
    </>
  );
}

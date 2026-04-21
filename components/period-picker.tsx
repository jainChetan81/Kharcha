import { format, parse } from "date-fns";
import { lazy, Suspense, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import {
  DATE_FORMAT,
  DATE_ISO_FORMAT,
  PERIOD_PRESET,
  type PeriodPresetType,
} from "@/lib/constants";
import { getPresetRange } from "@/lib/date";
import { cn } from "@/lib/utils";

const DatePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DatePickerModal,
  })),
);

const PRESET_LABELS: Record<PeriodPresetType, string> = {
  [PERIOD_PRESET.TODAY]: "Today",
  [PERIOD_PRESET.THIS_WEEK]: "This Week",
  [PERIOD_PRESET.LAST_7_DAYS]: "Last 7 Days",
  [PERIOD_PRESET.THIS_MONTH]: "This Month",
  [PERIOD_PRESET.LAST_MONTH]: "Last Month",
  [PERIOD_PRESET.THIS_YEAR]: "This Year",
  [PERIOD_PRESET.CUSTOM]: "Custom",
};

type PeriodPickerProps = {
  preset: PeriodPresetType | null;
  dateFrom: string | null;
  dateTo: string | null;
  onPresetChange: (preset: PeriodPresetType | null) => void;
  onDateFromChange: (date: string | null) => void;
  onDateToChange: (date: string | null) => void;
};

export function PeriodPicker({
  preset,
  dateFrom,
  dateTo,
  onPresetChange,
  onDateFromChange,
  onDateToChange,
}: PeriodPickerProps) {
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  function handlePresetSelect(p: PeriodPresetType) {
    if (p === preset) {
      onPresetChange(null);
      onDateFromChange(null);
      onDateToChange(null);
      return;
    }
    onPresetChange(p);
    if (p !== PERIOD_PRESET.CUSTOM) {
      const range = getPresetRange(p);
      onDateFromChange(range.from);
      onDateToChange(range.to);
    }
  }

  return (
    <>
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Period
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
        contentContainerStyle={{ gap: 8, paddingRight: 24 }}
      >
        {Object.values(PERIOD_PRESET).map((p) => (
          <Pressable
            key={p}
            onPress={() => handlePresetSelect(p)}
            className={cn(
              "rounded-full px-4 py-2.5",
              preset === p ? "bg-primary" : "border border-border bg-card",
            )}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                preset === p
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {PRESET_LABELS[p]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {preset === PERIOD_PRESET.CUSTOM && (
        <View className="mb-3 flex-row gap-3">
          <Pressable
            onPress={() => setShowFromPicker(true)}
            className="flex-1 rounded-xl bg-muted px-4 py-3"
          >
            <Text className="text-xs text-muted-foreground">From</Text>
            <Text className="text-sm font-medium text-foreground">
              {dateFrom
                ? format(
                    parse(dateFrom, DATE_ISO_FORMAT, new Date()),
                    DATE_FORMAT,
                  )
                : "Select"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowToPicker(true)}
            className="flex-1 rounded-xl bg-muted px-4 py-3"
          >
            <Text className="text-xs text-muted-foreground">To</Text>
            <Text className="text-sm font-medium text-foreground">
              {dateTo
                ? format(
                    parse(dateTo, DATE_ISO_FORMAT, new Date()),
                    DATE_FORMAT,
                  )
                : "Select"}
            </Text>
          </Pressable>
        </View>
      )}
      <Suspense fallback={null}>
        <DatePickerModal
          visible={showFromPicker}
          value={
            dateFrom ? parse(dateFrom, DATE_ISO_FORMAT, new Date()) : new Date()
          }
          title="From Date"
          onConfirm={(date) => {
            setShowFromPicker(false);
            onDateFromChange(format(date, DATE_ISO_FORMAT));
          }}
          onCancel={() => setShowFromPicker(false)}
          onClear={() => {
            setShowFromPicker(false);
            onDateFromChange(null);
          }}
        />
        <DatePickerModal
          visible={showToPicker}
          value={
            dateTo ? parse(dateTo, DATE_ISO_FORMAT, new Date()) : new Date()
          }
          title="To Date"
          onConfirm={(date) => {
            setShowToPicker(false);
            onDateToChange(format(date, DATE_ISO_FORMAT));
          }}
          onCancel={() => setShowToPicker(false)}
          onClear={() => {
            setShowToPicker(false);
            onDateToChange(null);
          }}
        />
      </Suspense>
    </>
  );
}

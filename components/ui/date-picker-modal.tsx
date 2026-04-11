import { lazy, Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { COLORS } from "@/lib/constants";
import { Text } from "./text";

const DateTimePicker = lazy(
  () => import("@react-native-community/datetimepicker"),
);

function PickerLoader() {
  return (
    <View className="items-center justify-center py-16">
      <ActivityIndicator size="small" color={COLORS.PRIMARY} />
    </View>
  );
}

export function DatePickerModal({
  visible,
  value,
  title = "Select Date",
  maximumDate,
  minimumDate,
  onConfirm,
  onCancel,
  onClear,
}: {
  visible: boolean;
  value: Date;
  title?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  onClear?: () => void;
}) {
  const [tempDate, setTempDate] = useState(value);

  useEffect(() => {
    if (visible) setTempDate(value);
  }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable className="flex-1 bg-black/50" onPress={onCancel} />
      <View className="rounded-t-2xl bg-card">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Pressable onPress={onCancel}>
            <Text className="text-base font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <View className="flex-row items-center gap-4">
            {onClear && (
              <Pressable onPress={onClear}>
                <Text className="text-base font-medium text-negative">
                  Clear
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => onConfirm(tempDate)}>
              <Text className="text-base font-semibold text-primary">Done</Text>
            </Pressable>
          </View>
        </View>
        <ComponentErrorBoundary onDismiss={onCancel}>
          <Suspense fallback={<PickerLoader />}>
            <View className="items-center pb-6">
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                themeVariant="dark"
                textColor={COLORS.WHITE}
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setTempDate(selectedDate);
                }}
              />
            </View>
          </Suspense>
        </ComponentErrorBoundary>
      </View>
    </Modal>
  );
}

export function DateTimePickerModal({
  visible,
  value,
  maximumDate,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  value: Date;
  maximumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}) {
  const [tempDate, setTempDate] = useState(value);
  const [step, setStep] = useState<"date" | "time">("date");

  useEffect(() => {
    if (visible) {
      setTempDate(value);
      setStep("date");
    }
  }, [visible, value]);

  function handleNext() {
    if (step === "date") {
      setStep("time");
    } else {
      onConfirm(tempDate);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable className="flex-1 bg-black/50" onPress={onCancel} />
      <View className="rounded-t-2xl bg-card">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Pressable onPress={onCancel}>
            <Text className="text-base font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {step === "date" ? "Select Date" : "Select Time"}
          </Text>
          <Pressable onPress={handleNext}>
            <Text className="text-base font-semibold text-primary">
              {step === "date" ? "Next" : "Done"}
            </Text>
          </Pressable>
        </View>
        <ComponentErrorBoundary onDismiss={onCancel}>
          <Suspense fallback={<PickerLoader />}>
            <View className="items-center pb-6">
              <DateTimePicker
                value={tempDate}
                mode={step}
                display="spinner"
                themeVariant="dark"
                textColor={COLORS.WHITE}
                maximumDate={maximumDate}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setTempDate(selectedDate);
                }}
              />
            </View>
          </Suspense>
        </ComponentErrorBoundary>
      </View>
    </Modal>
  );
}

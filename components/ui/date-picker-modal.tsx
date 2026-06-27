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

  // Only seed tempDate from `value` when the modal opens. Parents often pass
  // `value` as a freshly-parsed Date on every render (e.g. parse(dateFrom, ...)),
  // so depending on `value` here would clobber the user's spinner selection
  // whenever the parent re-renders (e.g. a query refetch).
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) setTempDate(value);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onCancel}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View className="rounded-t-2xl bg-card">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
            <Text className="text-base font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <View className="flex-row items-center gap-4">
            {onClear && (
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="text-base font-medium text-negative-text">
                  Clear
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => onConfirm(tempDate)}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text className="text-base font-semibold text-primary-text">
                Done
              </Text>
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

export function TimePickerModal({
  visible,
  value,
  title = "Select Time",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  value: Date;
  title?: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}) {
  const [tempDate, setTempDate] = useState(value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) setTempDate(value);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onCancel}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View className="rounded-t-2xl bg-card">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
            <Text className="text-base font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <Pressable
            onPress={() => onConfirm(tempDate)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text className="text-base font-semibold text-primary-text">
              Done
            </Text>
          </Pressable>
        </View>
        <ComponentErrorBoundary onDismiss={onCancel}>
          <Suspense fallback={<PickerLoader />}>
            <View className="items-center pb-6">
              <DateTimePicker
                value={tempDate}
                mode="time"
                display="spinner"
                themeVariant="dark"
                textColor={COLORS.WHITE}
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
  minimumDate,
  onConfirm,
  onCancel,
  onClear,
}: {
  visible: boolean;
  value: Date;
  maximumDate?: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  onClear?: () => void;
}) {
  const [tempDate, setTempDate] = useState(value);
  const [step, setStep] = useState<"date" | "time">("date");

  // See note in DatePickerModal above: seed only on open, not on every render,
  // otherwise a parent re-render rebuilds the `value` Date and snaps the
  // spinner back to the committed value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) {
      setTempDate(value);
      setStep("date");
    }
  }, [visible]);

  function handleNext() {
    if (step === "date") {
      setStep("time");
    } else {
      onConfirm(tempDate);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onCancel}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View className="rounded-t-2xl bg-card">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
            <Text className="text-base font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">
            {step === "date" ? "Select Date" : "Select Time"}
          </Text>
          <View className="flex-row items-center gap-4">
            {onClear && (
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="text-base font-medium text-negative-text">
                  Clear
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleNext}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text className="text-base font-semibold text-primary-text">
                {step === "date" ? "Next" : "Done"}
              </Text>
            </Pressable>
          </View>
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

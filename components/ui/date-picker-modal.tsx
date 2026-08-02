import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";

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

// Shared chrome for all three picker modals below: the transparent backdrop,
// the rounded-top header row (Cancel / optional Clear / Done-or-Next), and
// the error-boundary + Suspense wrapper around the actual spinner. Each
// modal keeps its own tempDate/step state and useEffect — only the JSX
// chrome moves here.
function PickerModalShell({
  visible,
  title,
  onCancel,
  onClear,
  doneLabel,
  onDone,
  children,
}: {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onClear?: () => void;
  doneLabel: string;
  onDone: () => void;
  children: ReactNode;
}) {
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
            <Pressable onPress={onDone} accessibilityRole="button" hitSlop={8}>
              <Text className="text-base font-semibold text-primary-text">
                {doneLabel}
              </Text>
            </Pressable>
          </View>
        </View>
        <ComponentErrorBoundary onDismiss={onCancel}>
          <Suspense fallback={<PickerLoader />}>
            <View className="items-center pb-6">{children}</View>
          </Suspense>
        </ComponentErrorBoundary>
      </View>
    </Modal>
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
    <PickerModalShell
      visible={visible}
      title={title}
      onCancel={onCancel}
      onClear={onClear}
      doneLabel="Done"
      onDone={() => onConfirm(tempDate)}
    >
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
    </PickerModalShell>
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
    <PickerModalShell
      visible={visible}
      title={title}
      onCancel={onCancel}
      doneLabel="Done"
      onDone={() => onConfirm(tempDate)}
    >
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
    </PickerModalShell>
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
    <PickerModalShell
      visible={visible}
      title={step === "date" ? "Select Date" : "Select Time"}
      onCancel={onCancel}
      onClear={onClear}
      doneLabel={step === "date" ? "Next" : "Done"}
      onDone={handleNext}
    >
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
    </PickerModalShell>
  );
}

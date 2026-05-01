import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { DateTimePickerField } from "@/components/ui/date-time-picker-field";
import { FieldError } from "@/components/ui/field-error";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
import {
  requiredStringSchema,
  tagScheduleSchema,
  validateField,
} from "@/lib/validation";

type TagScheduleSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    startAt: string;
    endAt: string;
  }) => Promise<void>;
  defaults?: {
    name?: string;
    startAt?: string;
    endAt?: string;
  };
  title: string;
  submitLabel: string;
};

export function TagScheduleSheet({
  visible,
  onClose,
  onSubmit,
  defaults,
  title,
  submitLabel,
}: TagScheduleSheetProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      name: defaults?.name ?? "",
      startAt: defaults?.startAt ?? "",
      endAt: defaults?.endAt ?? "",
    },
    onSubmit: async ({ value }) => {
      const parsed = tagScheduleSchema.safeParse(value);
      if (!parsed.success) return;
      await onSubmit(parsed.data);
    },
  });

  // Reset when the sheet opens. Without this, reopening the sheet to schedule
  // a different tag shows the prior values until the user types over them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) {
      form.reset({
        name: defaults?.name ?? "",
        startAt: defaults?.startAt ?? "",
        endAt: defaults?.endAt ?? "",
      });
    }
  }, [visible]);

  return (
    <BottomSheet
      visible={visible && !pickerOpen}
      onClose={onClose}
      avoidKeyboard
    >
      <Text className="mb-4 text-base font-bold text-foreground">{title}</Text>

      <form.Field
        name="name"
        validators={{
          onSubmit: ({ value }) =>
            validateField(requiredStringSchema("Name"), value),
        }}
      >
        {(field) => (
          <View className="mb-4">
            <FormLabel>Name</FormLabel>
            <Input
              placeholder="e.g. office, wedding, goa-trip"
              value={field.state.value}
              onChangeText={(v) => field.handleChange(v)}
              placeholderTextColor={COLORS.MUTED}
              autoFocus
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.startAt}>
        {(startAt) => (
          <View className="flex-row gap-3">
            <form.Field
              name="startAt"
              validators={{
                onSubmit: ({ value }) => (value ? undefined : "Pick a start"),
              }}
            >
              {(field) => (
                <View className="flex-1">
                  <DateTimePickerField
                    label="Start"
                    value={field.state.value || null}
                    onChange={(v) => field.handleChange(v)}
                    onPickerVisibilityChange={setPickerOpen}
                  />
                </View>
              )}
            </form.Field>
            <form.Field
              name="endAt"
              validators={{
                onChange: ({ value }) =>
                  value && startAt && value < startAt
                    ? "End must be on or after start"
                    : undefined,
                onSubmit: ({ value }) => (value ? undefined : "Pick an end"),
              }}
            >
              {(field) => (
                <View className="flex-1">
                  <DateTimePickerField
                    label="End"
                    value={field.state.value || null}
                    onChange={(v) => field.handleChange(v)}
                    minValue={startAt || null}
                    onPickerVisibilityChange={setPickerOpen}
                  />
                </View>
              )}
            </form.Field>
          </View>
        )}
      </form.Subscribe>

      <form.Subscribe selector={(s) => s.fieldMeta.endAt?.errors as string[]}>
        {(errs) => <FieldError errors={errs ?? []} />}
      </form.Subscribe>

      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
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
              onPress={() => form.handleSubmit()}
              disabled={!canSubmit || isSubmitting}
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                {submitLabel}
              </Text>
            </Button>
          </View>
        )}
      </form.Subscribe>
    </BottomSheet>
  );
}

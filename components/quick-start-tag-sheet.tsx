import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useEffect } from "react";
import { View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import { COLORS, DATE_TIME_FORMAT } from "@/lib/constants";
import {
  DURATION_OPTIONS,
  type DurationKey,
  durationEnd,
} from "@/lib/tag-duration";
import { requiredStringSchema, validateField } from "@/lib/validation";

type QuickStartTagSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    startAt: string;
    endAt: string;
  }) => Promise<void>;
  /** Pre-fills the name field. Used when activating an existing tag. */
  defaultName?: string;
};

export function QuickStartTagSheet({
  visible,
  onClose,
  onSubmit,
  defaultName,
}: QuickStartTagSheetProps) {
  const form = useForm({
    defaultValues: {
      name: defaultName ?? "",
      duration: "8h" as DurationKey,
    },
    onSubmit: async ({ value }) => {
      const trimmed = value.name.trim();
      if (!trimmed) return;
      const now = new Date();
      await onSubmit({
        name: trimmed,
        startAt: format(now, DATE_TIME_FORMAT),
        endAt: format(durationEnd(value.duration, now), DATE_TIME_FORMAT),
      });
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only
  useEffect(() => {
    if (visible) {
      form.reset({ name: defaultName ?? "", duration: "8h" });
    }
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text className="mb-1 text-base font-bold text-foreground">
        Start a scope now
      </Text>
      <Text className="mb-4 text-xs text-muted-foreground">
        New transactions will auto-tag with this tag until it ends.
      </Text>

      <form.Field
        name="name"
        validators={{
          onSubmit: ({ value }) =>
            validateField(requiredStringSchema("Name"), value),
        }}
      >
        {(field) => (
          <View>
            <FormLabel>Name</FormLabel>
            <Input
              placeholder="e.g. office, brunch, errand"
              value={field.state.value}
              onChangeText={(v) => field.handleChange(v)}
              placeholderTextColor={COLORS.MUTED}
              autoFocus
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      <View className="mt-4">
        <FormLabel>Duration</FormLabel>
        <form.Field name="duration">
          {(field) => (
            <SegmentedControl
              options={DURATION_OPTIONS}
              value={field.state.value}
              onChange={(v) => field.handleChange(v)}
            />
          )}
        </form.Field>
      </View>

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
                Start now
              </Text>
            </Button>
          </View>
        )}
      </form.Subscribe>
    </BottomSheet>
  );
}

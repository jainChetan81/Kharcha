import DateTimePicker from "@react-native-community/datetimepicker";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { Calendar } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { ChipPicker } from "@/components/ui/chip-picker";
import { FieldError } from "@/components/ui/field-error";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  COLORS,
  DATE_DISPLAY_FORMAT,
  DATE_TIME_FORMAT,
  QUERY_KEYS,
} from "@/lib/constants";
import { getAllSources, getCategoriesByType } from "@/lib/db";
import { parseDate } from "@/lib/format";
import { showErrorToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type TransactionFormValues = {
  type: "income" | "expense";
  amount: string;
  merchant: string;
  categoryId: number | null;
  sourceId: number | null;
  date: string;
  note: string;
};

export function TransactionForm({
  defaultValues,
  submitLabel,
  onSubmit,
  lockType = false,
}: {
  defaultValues: TransactionFormValues;
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  lockType?: boolean;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [activeType, setActiveType] = useState<"income" | "expense">(
    defaultValues.type,
  );

  const { data: categories = [] } = useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, activeType],
    queryFn: () => getCategoriesByType(activeType),
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
  });

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <ScrollView
      className="flex-1 px-5 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <form.Field name="type">
        {(field) => (
          <View className="mb-5 flex-row gap-3">
            <Pressable
              onPress={() => {
                field.handleChange("expense");
                setActiveType("expense");
                form.setFieldValue("categoryId", null);
              }}
              className={cn(
                "flex-1 items-center rounded-xl py-3",
                field.state.value === "expense" ? "bg-negative" : "bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  field.state.value === "expense"
                    ? "text-white"
                    : "text-muted-foreground",
                )}
              >
                Expense
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (lockType) return;
                field.handleChange("income");
                setActiveType("income");
                form.setFieldValue("categoryId", null);
                form.setFieldValue("sourceId", null);
              }}
              className={cn(
                "flex-1 items-center rounded-xl py-3",
                lockType && "opacity-40",
                field.state.value === "income" ? "bg-positive" : "bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  field.state.value === "income"
                    ? "text-white"
                    : "text-muted-foreground",
                )}
              >
                Income
              </Text>
            </Pressable>
          </View>
        )}
      </form.Field>

      <form.Field
        name="amount"
        validators={{
          onSubmit: ({ value }) => {
            const num = Number(value);
            if (!value || Number.isNaN(num) || num <= 0)
              return "Amount must be greater than 0";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Amount
            </Text>
            <Input
              placeholder="0"
              keyboardType="decimal-pad"
              autoCorrect={false}
              autoComplete="off"
              value={field.state.value}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^0-9.]/g, "");
                field.handleChange(cleaned);
              }}
              className="text-lg font-semibold"
              placeholderTextColor={COLORS.MUTED}
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      {activeType === "expense" && (
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Merchant
              </Text>
              <Input
                placeholder="e.g. Swiggy, Amazon"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                placeholderTextColor={COLORS.MUTED}
              />
            </View>
          )}
        </form.Field>
      )}

      <form.Field
        name="categoryId"
        validators={{
          onSubmit: ({ value }) => {
            if (!value) return "Category is required";
            return undefined;
          },
        }}
      >
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Category
            </Text>
            <ChipPicker
              items={categories}
              selectedId={field.state.value}
              onSelect={(id) => field.handleChange(id)}
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      {activeType === "income" && (
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                From
              </Text>
              <Input
                placeholder="e.g. Employer, Client name"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                placeholderTextColor={COLORS.MUTED}
              />
            </View>
          )}
        </form.Field>
      )}

      <form.Field
        name="sourceId"
        validators={{
          onSubmit: ({ value }) => {
            if (activeType === "expense" && !value) return "Source is required";
            return undefined;
          },
        }}
      >
        {(field) =>
          activeType === "expense" ? (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Source
              </Text>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          ) : null
        }
      </form.Field>

      <form.Field
        name="date"
        validators={{
          onSubmit: ({ value }) => {
            if (!value) return "Date is required";
            return undefined;
          },
        }}
      >
        {(field) => {
          const currentDate = field.state.value.includes(" ")
            ? parse(field.state.value, DATE_TIME_FORMAT, new Date())
            : parseDate(field.state.value);
          return (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Date & Time
              </Text>
              <Pressable
                onPress={() => {
                  setTempDate(currentDate);
                  setShowDatePicker(true);
                }}
                className="h-10 flex-row items-center justify-between rounded-xl border border-border bg-card px-3"
              >
                <Text className="text-base text-foreground">
                  {format(currentDate, DATE_DISPLAY_FORMAT)}
                </Text>
                <Icon as={Calendar} className="size-5 text-muted-foreground" />
              </Pressable>
              <FieldError errors={field.state.meta.errors as string[]} />

              <Modal
                visible={showDatePicker || showTimePicker}
                transparent
                animationType="slide"
              >
                <View className="flex-1 justify-end bg-black/50">
                  <View className="rounded-t-2xl bg-card pb-8">
                    <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
                      <Pressable
                        onPress={() => {
                          setShowDatePicker(false);
                          setShowTimePicker(false);
                        }}
                      >
                        <Text className="text-base font-medium text-muted-foreground">
                          Cancel
                        </Text>
                      </Pressable>
                      <Text className="text-base font-semibold text-foreground">
                        {showDatePicker ? "Select Date" : "Select Time"}
                      </Text>
                      <Pressable
                        onPress={() => {
                          if (showDatePicker) {
                            setShowDatePicker(false);
                            setShowTimePicker(true);
                          } else {
                            setShowTimePicker(false);
                            field.handleChange(
                              format(tempDate, DATE_TIME_FORMAT),
                            );
                          }
                        }}
                      >
                        <Text className="text-base font-semibold text-primary">
                          {showDatePicker ? "Next" : "Done"}
                        </Text>
                      </Pressable>
                    </View>
                    <View className="mx-[-16px]">
                      <DateTimePicker
                        value={tempDate}
                        mode={showDatePicker ? "date" : "time"}
                        display="spinner"
                        themeVariant="dark"
                        maximumDate={new Date()}
                        onChange={(_event, selectedDate) => {
                          if (selectedDate) {
                            setTempDate(selectedDate);
                          }
                        }}
                      />
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          );
        }}
      </form.Field>

      <form.Field name="note">
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Note
            </Text>
            <Input
              placeholder="Optional note"
              multiline
              numberOfLines={3}
              value={field.state.value}
              onChangeText={(v) => field.handleChange(v)}
              className="h-20 py-2"
              textAlignVertical="top"
              placeholderTextColor={COLORS.MUTED}
            />
          </View>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ isSubmitting }) => (
          <Button
            className="mb-6 h-12 rounded-2xl bg-primary"
            disabled={isSubmitting}
            onPress={async () => {
              await form.handleSubmit();
              if (form.state.canSubmit === false) {
                const allErrors = Object.values(form.state.fieldMeta)
                  .flatMap((m) => (m as { errors: string[] }).errors)
                  .filter(Boolean);
                if (allErrors.length > 0) {
                  showErrorToast("Missing fields", allErrors[0]);
                }
              }
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.WHITE} />
            ) : (
              <Text className="text-base font-semibold text-primary-foreground">
                {submitLabel}
              </Text>
            )}
          </Button>
        )}
      </form.Subscribe>
    </ScrollView>
  );
}

import DateTimePicker from "@react-native-community/datetimepicker";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { router } from "expo-router";
import { Calendar } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  DATE_DISPLAY_FORMAT,
  DATE_TIME_FORMAT,
  QUERY_KEYS,
} from "@/lib/constants";
import db, {
  getCategoriesByType,
  insertTransaction,
  type Source,
} from "@/lib/db";
import { cn, isIOS } from "@/lib/utils";

function FieldError({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return <Text className="mt-1 text-xs text-negative">{errors[0]}</Text>;
}

function ChipPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <View className="relative">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 24 }}
      >
        {items.map((item) => {
          const selected = selectedId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item.id)}
              className={cn(
                "rounded-full px-4 py-2.5",
                selected ? "bg-primary" : "border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium capitalize",
                  selected
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function AddTransaction() {
  const queryClient = useQueryClient();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [activeType, setActiveType] = useState<"income" | "expense">("expense");

  const { data: categories = [] } = useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, activeType],
    queryFn: () => getCategoriesByType(activeType),
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: () => db.getAllAsync<Source>("SELECT * FROM sources"),
  });

  const form = useForm({
    defaultValues: {
      type: "expense" as "income" | "expense",
      amount: "",
      merchant: "",
      categoryId: null as number | null,
      sourceId: null as number | null,
      date: format(new Date(), DATE_TIME_FORMAT),
      note: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await insertTransaction({
          type: value.type,
          amount: Number(value.amount),
          merchant: value.merchant || null,
          categoryId: value.categoryId,
          sourceId: value.type === "income" ? null : value.sourceId,
          date: value.date,
          note: value.note || null,
        });
        await queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.TRANSACTIONS],
        });
        await queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
        });
        Toast.show({
          type: "success",
          text1: "Transaction added",
          props: { amount: value.amount, type: value.type },
        });
        router.back();
      } catch (err) {
        Toast.show({
          type: "error",
          text1: "Failed to save",
          text2: String(err),
        });
      }
    },
  });

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-5",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">
          Add Transaction
        </Text>
        <View className="w-14" />
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type Toggle */}
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
                  field.handleChange("income");
                  setActiveType("income");
                  form.setFieldValue("categoryId", null);
                  form.setFieldValue("sourceId", null);
                }}
                className={cn(
                  "flex-1 items-center rounded-xl py-3",
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

        {/* Amount */}
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
                className="h-14 text-2xl font-bold"
                placeholderTextColor="#888888"
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        {/* Merchant — expense only */}
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
                  placeholderTextColor="#888888"
                />
              </View>
            )}
          </form.Field>
        )}

        {/* Category */}
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

        {/* From — income only */}
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
                  placeholderTextColor="#888888"
                />
              </View>
            )}
          </form.Field>
        )}

        {/* Source — expense only (always mounted to keep validator in sync) */}
        <form.Field
          name="sourceId"
          validators={{
            onSubmit: ({ value }) => {
              if (activeType === "expense" && !value)
                return "Source is required";
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

        {/* Date & Time */}
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
            const currentDate = parse(
              field.state.value,
              DATE_TIME_FORMAT,
              new Date(),
            );
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
                  <Icon
                    as={Calendar}
                    className="size-5 text-muted-foreground"
                  />
                </Pressable>
                <FieldError errors={field.state.meta.errors as string[]} />

                <Modal
                  visible={showDatePicker || showTimePicker}
                  transparent
                  animationType="slide"
                >
                  <View className="flex-1 justify-end bg-black/50">
                    <View className="rounded-t-2xl bg-card pb-8">
                      {/* Header */}
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

        {/* Note */}
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
                placeholderTextColor="#888888"
              />
            </View>
          )}
        </form.Field>

        {/* Submit */}
        <form.Subscribe
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
            errors: state.errors,
          })}
        >
          {({ isSubmitting }) => (
            <Button
              className="mb-10 h-14 rounded-2xl bg-primary"
              disabled={isSubmitting}
              onPress={async () => {
                await form.handleSubmit();
                if (form.state.canSubmit === false) {
                  const allErrors = Object.values(form.state.fieldMeta)
                    .flatMap((m) => (m as { errors: string[] }).errors)
                    .filter(Boolean);
                  if (allErrors.length > 0) {
                    Toast.show({
                      type: "error",
                      text1: "Missing fields",
                      text2: allErrors[0] as string,
                    });
                  }
                }
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-base font-semibold text-primary-foreground">
                  Add Transaction
                </Text>
              )}
            </Button>
          )}
        </form.Subscribe>
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

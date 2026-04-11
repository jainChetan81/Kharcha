import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { Calendar } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
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
  TRANSACTION_TYPE,
} from "@/lib/constants";
import {
  getAllSources,
  getCategoriesByType,
  getMostUsedCategoryForMerchant,
} from "@/lib/db";
import { parseDate } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const DateTimePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DateTimePickerModal,
  })),
);

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
  onDelete,
  lockType = false,
}: {
  defaultValues: TransactionFormValues;
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onDelete?: () => void;
  lockType?: boolean;
}) {
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [activeType, setActiveType] = useState<"income" | "expense">(
    defaultValues.type,
  );
  const [userChangedCategory, setUserChangedCategory] = useState(false);
  const [autoFilledMerchant, setAutoFilledMerchant] = useState<string | null>(
    null,
  );

  async function autoCategoryFromMerchant(merchant: string) {
    const trimmed = merchant.trim();
    if (trimmed.length < 3 || userChangedCategory) return;
    // Don't re-run for the same merchant text that we already auto-filled.
    if (autoFilledMerchant?.toLowerCase() === trimmed.toLowerCase()) return;
    try {
      const categoryId = await getMostUsedCategoryForMerchant(
        trimmed,
        activeType,
      );
      if (categoryId && !userChangedCategory) {
        form.setFieldValue("categoryId", categoryId);
        setAutoFilledMerchant(trimmed);
        showSuccessToast("category set from history ✨");
      }
    } catch (err) {
      // Best-effort feature — swallow DB errors so the form stays usable.
      console.warn("autoCategoryFromMerchant failed:", err);
    }
  }

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
                field.handleChange(TRANSACTION_TYPE.EXPENSE);
                setActiveType(TRANSACTION_TYPE.EXPENSE);
                form.setFieldValue("categoryId", null);
              }}
              className={cn(
                "flex-1 items-center rounded-xl py-3",
                field.state.value === TRANSACTION_TYPE.EXPENSE
                  ? "bg-negative"
                  : "bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  field.state.value === TRANSACTION_TYPE.EXPENSE
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
                field.handleChange(TRANSACTION_TYPE.INCOME);
                setActiveType(TRANSACTION_TYPE.INCOME);
                form.setFieldValue("categoryId", null);
                form.setFieldValue("sourceId", null);
              }}
              className={cn(
                "flex-1 items-center rounded-xl py-3",
                lockType && "opacity-40",
                field.state.value === TRANSACTION_TYPE.INCOME
                  ? "bg-positive"
                  : "bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  field.state.value === TRANSACTION_TYPE.INCOME
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
              className="h-14 text-2xl font-bold"
              placeholderTextColor={COLORS.MUTED}
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      {activeType === TRANSACTION_TYPE.EXPENSE && (
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
                onBlur={() => autoCategoryFromMerchant(field.state.value)}
                placeholderTextColor={COLORS.MUTED}
              />
            </View>
          )}
        </form.Field>
      )}

      <form.Field name="categoryId">
        {(field) => (
          <View className="mb-5">
            <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
              Category
            </Text>
            <ChipPicker
              items={categories}
              selectedId={field.state.value}
              onSelect={(id) => {
                setUserChangedCategory(true);
                field.handleChange(id);
              }}
            />
          </View>
        )}
      </form.Field>

      {activeType === TRANSACTION_TYPE.INCOME && (
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
                onBlur={() => autoCategoryFromMerchant(field.state.value)}
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
            if (activeType === TRANSACTION_TYPE.EXPENSE && !value)
              return "Source is required";
            return undefined;
          },
        }}
      >
        {(field) =>
          activeType === TRANSACTION_TYPE.EXPENSE ? (
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
                  setDatePickerValue(currentDate);
                  setShowDateTimePicker(true);
                }}
                className="h-10 flex-row items-center justify-between rounded-xl border border-border bg-card px-3"
              >
                <Text className="text-base text-foreground">
                  {format(currentDate, DATE_DISPLAY_FORMAT)}
                </Text>
                <Icon as={Calendar} className="size-5 text-muted-foreground" />
              </Pressable>
              <FieldError errors={field.state.meta.errors as string[]} />

              <Suspense fallback={null}>
                <DateTimePickerModal
                  visible={showDateTimePicker}
                  value={datePickerValue}
                  maximumDate={new Date()}
                  onConfirm={(date) => {
                    setShowDateTimePicker(false);
                    field.handleChange(format(date, DATE_TIME_FORMAT));
                  }}
                  onCancel={() => setShowDateTimePicker(false)}
                />
              </Suspense>
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
          <View className="mb-6 flex-row gap-3">
            {onDelete && (
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-2xl border-negative"
                onPress={onDelete}
              >
                <Text className="text-base font-semibold text-negative">
                  Delete
                </Text>
              </Button>
            )}
            <Button
              className={cn(
                "h-12 rounded-2xl bg-primary",
                onDelete ? "flex-1" : "w-full",
              )}
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
          </View>
        )}
      </form.Subscribe>
    </ScrollView>
  );
}

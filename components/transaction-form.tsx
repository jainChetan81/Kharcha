import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { Calendar } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
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
  REIMBURSEMENT_STATUS,
  type ReimbursementStatusType,
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
  type: "income" | "expense" | "transfer";
  amount: string;
  merchant: string;
  categoryId: number | null;
  sourceId: number | null;
  destinationSourceId: number | null;
  date: string;
  note: string;
  reimbursementStatus: ReimbursementStatusType;
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
  const [activeType, setActiveType] = useState<
    "income" | "expense" | "transfer"
  >(defaultValues.type);
  const [userChangedCategory, setUserChangedCategory] = useState(false);
  const [autoFilledMerchant, setAutoFilledMerchant] = useState<string | null>(
    null,
  );

  const isTransfer = activeType === TRANSACTION_TYPE.TRANSFER;
  const categoryType = isTransfer ? "expense" : activeType;

  async function autoCategoryFromMerchant(merchant: string) {
    const trimmed = merchant.trim();
    if (trimmed.length < 3 || userChangedCategory || isTransfer) return;
    // Don't re-run for the same merchant text that we already auto-filled.
    if (autoFilledMerchant?.toLowerCase() === trimmed.toLowerCase()) return;
    try {
      const categoryId = await getMostUsedCategoryForMerchant(
        trimmed,
        categoryType,
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
    queryKey: [QUERY_KEYS.CATEGORIES, categoryType],
    queryFn: () => getCategoriesByType(categoryType),
    enabled: !isTransfer,
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
        {(field) => {
          const typeButtons: {
            key: "expense" | "income" | "transfer";
            label: string;
            activeClass: string;
          }[] = [
            {
              key: TRANSACTION_TYPE.EXPENSE,
              label: "Expense",
              activeClass: "bg-negative",
            },
            {
              key: TRANSACTION_TYPE.INCOME,
              label: "Income",
              activeClass: "bg-positive",
            },
            {
              key: TRANSACTION_TYPE.TRANSFER,
              label: "Transfer",
              activeClass: "bg-muted-foreground",
            },
          ];
          return (
            <View className="mb-5 flex-row gap-3">
              {typeButtons.map((btn) => (
                <Pressable
                  key={btn.key}
                  onPress={() => {
                    if (lockType && btn.key !== defaultValues.type) return;
                    field.handleChange(btn.key);
                    setActiveType(btn.key);
                    form.setFieldValue("categoryId", null);
                    if (btn.key === TRANSACTION_TYPE.INCOME) {
                      form.setFieldValue("sourceId", null);
                      form.setFieldValue("destinationSourceId", null);
                    }
                    if (btn.key === TRANSACTION_TYPE.EXPENSE) {
                      form.setFieldValue("destinationSourceId", null);
                    }
                    if (btn.key !== TRANSACTION_TYPE.EXPENSE) {
                      form.setFieldValue(
                        "reimbursementStatus",
                        REIMBURSEMENT_STATUS.NONE,
                      );
                    }
                  }}
                  className={cn(
                    "flex-1 items-center rounded-xl py-3",
                    lockType && btn.key !== defaultValues.type && "opacity-40",
                    field.state.value === btn.key ? btn.activeClass : "bg-card",
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-semibold",
                      field.state.value === btn.key
                        ? "text-white"
                        : "text-muted-foreground",
                    )}
                  >
                    {btn.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        }}
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

      {isTransfer && (
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Description
              </Text>
              <Input
                placeholder="Optional description"
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                placeholderTextColor={COLORS.MUTED}
              />
            </View>
          )}
        </form.Field>
      )}

      {!isTransfer && (
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
      )}

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
            if (activeType !== TRANSACTION_TYPE.INCOME && !value)
              return "Source is required";
            return undefined;
          },
        }}
      >
        {(field) =>
          activeType !== TRANSACTION_TYPE.INCOME ? (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                {isTransfer ? "From" : "Source"}
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

      {isTransfer && (
        <form.Field
          name="destinationSourceId"
          validators={{
            onSubmit: ({ value, fieldApi }) => {
              if (!value) return "Destination is required";
              if (value === fieldApi.form.getFieldValue("sourceId"))
                return "Destination must be different from source";
              return undefined;
            },
          }}
        >
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                To
              </Text>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>
      )}

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

      {activeType === TRANSACTION_TYPE.EXPENSE && (
        <form.Field name="reimbursementStatus">
          {(field) => {
            const isReimbursable =
              field.state.value !== REIMBURSEMENT_STATUS.NONE;
            const isReimbursed =
              field.state.value === REIMBURSEMENT_STATUS.REIMBURSED;
            return (
              <View className="mb-5 rounded-xl border border-border bg-card p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-foreground">
                      Reimbursable
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      Track this expense for reimbursement
                    </Text>
                  </View>
                  <Switch
                    value={isReimbursable}
                    onValueChange={(val) =>
                      field.handleChange(
                        val
                          ? REIMBURSEMENT_STATUS.PENDING
                          : REIMBURSEMENT_STATUS.NONE,
                      )
                    }
                    trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
                    thumbColor={COLORS.FOREGROUND}
                  />
                </View>
                {isReimbursable && (
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() =>
                        field.handleChange(REIMBURSEMENT_STATUS.PENDING)
                      }
                      className={cn(
                        "flex-1 items-center rounded-xl py-2.5",
                        !isReimbursed ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-sm font-medium",
                          !isReimbursed
                            ? "text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        Pending
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        field.handleChange(REIMBURSEMENT_STATUS.REIMBURSED)
                      }
                      className={cn(
                        "flex-1 items-center rounded-xl py-2.5",
                        isReimbursed ? "bg-positive" : "bg-muted",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-sm font-medium",
                          isReimbursed ? "text-white" : "text-muted-foreground",
                        )}
                      >
                        Reimbursed
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        </form.Field>
      )}

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

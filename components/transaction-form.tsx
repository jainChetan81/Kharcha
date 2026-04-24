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
import { InvestmentFields } from "@/components/investment-fields";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ChipPicker, MultiChipPicker } from "@/components/ui/chip-picker";
import { FieldError } from "@/components/ui/field-error";
import { FormLabel } from "@/components/ui/form-label";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useDebounce } from "@/hooks/use-debounce";
import { useAllHoldings } from "@/hooks/use-holdings";
import { useInlineAdders } from "@/hooks/use-inline-adders";
import { useAddTag, useAllTags } from "@/hooks/use-tags";
import {
  COLORS,
  DATE_DISPLAY_FORMAT,
  DATE_TIME_FORMAT,
  type InvestmentKindType,
  QUERY_KEYS,
  REIMBURSEMENT_STATUS,
  type ReimbursementStatusType,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import {
  getAllSources,
  getCategoriesByType,
  getMostUsedCategoryForMerchant,
  searchMerchants,
} from "@/lib/db";
import { parseDate, sanitizeDecimalInput } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { amountStringSchema, validateField } from "@/lib/validation";

const DateTimePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DateTimePickerModal,
  })),
);

export type TransactionFormValues = {
  type: "income" | "expense" | "transfer" | "investment";
  amount: string;
  merchant: string;
  categoryId: number | null;
  sourceId: number | null;
  destinationSourceId: number | null;
  holdingId: number | null;
  investmentKind: InvestmentKindType;
  units: string;
  date: string;
  note: string;
  reimbursementStatus: ReimbursementStatusType;
  tagIds: number[];
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
    "income" | "expense" | "transfer" | "investment"
  >(defaultValues.type);
  const [userChangedCategory, setUserChangedCategory] = useState(false);
  const [autoFilledMerchant, setAutoFilledMerchant] = useState<string | null>(
    null,
  );
  const [merchantSearch, setMerchantSearch] = useState(defaultValues.merchant);
  const debouncedMerchant = useDebounce(merchantSearch, 300);
  const [newTagSheetVisible, setNewTagSheetVisible] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<
    "sourceId" | "destinationSourceId"
  >("sourceId");
  const { data: allTags = [] } = useAllTags();
  const addTagMutation = useAddTag();
  const { data: allHoldings = [] } = useAllHoldings();
  const openHoldings = allHoldings.filter((h) => h.is_closed === 0);

  const isTransfer = activeType === TRANSACTION_TYPE.TRANSFER;
  const isInvestment = activeType === TRANSACTION_TYPE.INVESTMENT;
  const categoryType = isTransfer || isInvestment ? "expense" : activeType;

  async function autoCategoryFromMerchant(merchant: string) {
    const trimmed = merchant.trim();
    if (trimmed.length < 3 || userChangedCategory || isTransfer || isInvestment)
      return;
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
    enabled: !isTransfer && !isInvestment,
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
  });

  const { data: suggestedMerchants = [] } = useQuery({
    queryKey: ["merchant-suggestions", debouncedMerchant],
    queryFn: () => searchMerchants(debouncedMerchant),
    enabled: !isTransfer && debouncedMerchant.length > 1,
  });

  const filteredSuggestions = suggestedMerchants.filter(
    (m) => m.toLowerCase() !== merchantSearch.toLowerCase(),
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const adders = useInlineAdders({
    categoryType: categoryType === "income" ? "income" : "expense",
    onCategoryAdded: (id) => {
      setUserChangedCategory(true);
      form.setFieldValue("categoryId", id);
    },
    // sourceTarget is stateful: the same sheet handles both the primary
    // source field and the transfer destination, whichever picker was tapped
    // most recently. The setter below captures that intent before openSource.
    onSourceAdded: (id) => form.setFieldValue(sourceTarget, id),
    onHoldingAdded: (id) => form.setFieldValue("holdingId", id),
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
            key: "expense" | "income" | "transfer" | "investment";
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
            {
              key: TRANSACTION_TYPE.INVESTMENT,
              label: "Invest",
              activeClass: "bg-primary",
            },
          ];
          return (
            <View className="mb-5 flex-row gap-2">
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
                    if (btn.key !== TRANSACTION_TYPE.INVESTMENT) {
                      form.setFieldValue("holdingId", null);
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
          onSubmit: ({ value }) => validateField(amountStringSchema, value),
        }}
      >
        {(field) => (
          <View className="mb-5">
            <FormLabel>Amount</FormLabel>
            <Input
              placeholder="0"
              keyboardType="decimal-pad"
              autoCorrect={false}
              autoComplete="off"
              value={field.state.value}
              onChangeText={(v) => {
                const cleaned = sanitizeDecimalInput(v);
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
              <FormLabel>Merchant</FormLabel>
              <Input
                placeholder="e.g. Swiggy, Amazon"
                value={field.state.value}
                onChangeText={(v) => {
                  field.handleChange(v);
                  setMerchantSearch(v);
                }}
                onBlur={() => autoCategoryFromMerchant(field.state.value)}
                placeholderTextColor={COLORS.MUTED}
              />
              {filteredSuggestions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-2"
                  contentContainerStyle={{ gap: 8 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredSuggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => {
                        field.handleChange(suggestion);
                        setMerchantSearch(suggestion);
                        autoCategoryFromMerchant(suggestion);
                      }}
                      className="rounded-lg border border-border bg-card px-3 py-1.5"
                    >
                      <Text className="text-sm font-medium text-foreground">
                        {suggestion}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </form.Field>
      )}

      {isTransfer && (
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <FormLabel>Description</FormLabel>
              <Input
                placeholder="Optional description"
                value={field.state.value}
                onChangeText={(v) => {
                  field.handleChange(v);
                  setMerchantSearch(v);
                }}
                placeholderTextColor={COLORS.MUTED}
              />
            </View>
          )}
        </form.Field>
      )}

      {!isTransfer && !isInvestment && (
        <form.Field name="categoryId">
          {(field) => (
            <View className="mb-5">
              <FormLabel>Category</FormLabel>
              <ChipPicker
                items={categories}
                selectedId={field.state.value}
                onSelect={(id) => {
                  setUserChangedCategory(true);
                  field.handleChange(id);
                }}
                onAddNew={adders.openCategory}
                addLabel="New category"
              />
            </View>
          )}
        </form.Field>
      )}

      {isInvestment && (
        <InvestmentFields
          form={form}
          openHoldings={openHoldings}
          onAddNewHolding={adders.openHolding}
        />
      )}

      {activeType === TRANSACTION_TYPE.INCOME && (
        <form.Field name="merchant">
          {(field) => (
            <View className="mb-5">
              <FormLabel>From</FormLabel>
              <Input
                placeholder="e.g. Employer, Client name"
                value={field.state.value}
                onChangeText={(v) => {
                  field.handleChange(v);
                  setMerchantSearch(v);
                }}
                onBlur={() => autoCategoryFromMerchant(field.state.value)}
                placeholderTextColor={COLORS.MUTED}
              />
              {filteredSuggestions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-2"
                  contentContainerStyle={{ gap: 8 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredSuggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => {
                        field.handleChange(suggestion);
                        setMerchantSearch(suggestion);
                        autoCategoryFromMerchant(suggestion);
                      }}
                      className="rounded-lg border border-border bg-card px-3 py-1.5"
                    >
                      <Text className="text-sm font-medium text-foreground">
                        {suggestion}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
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
              <FormLabel>
                {isTransfer ? "From" : isInvestment ? "Cash Account" : "Source"}
              </FormLabel>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
                onAddNew={() => {
                  setSourceTarget("sourceId");
                  adders.openSource();
                }}
                addLabel="New source"
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
              <FormLabel>To</FormLabel>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
                onAddNew={() => {
                  setSourceTarget("destinationSourceId");
                  adders.openSource();
                }}
                addLabel="New source"
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
              <FormLabel>Date & Time</FormLabel>
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
            <FormLabel>Note</FormLabel>
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

      <form.Field name="tagIds">
        {(field) => (
          <View className="mb-5">
            <FormLabel>Tags</FormLabel>
            <MultiChipPicker
              items={allTags}
              selectedIds={field.state.value ?? []}
              onChange={(ids) => field.handleChange(ids)}
              onAddNew={() => setNewTagSheetVisible(true)}
              emptyLabel="No tags yet — create one to group transactions across categories"
            />
          </View>
        )}
      </form.Field>

      <BottomSheet
        visible={newTagSheetVisible}
        onClose={() => setNewTagSheetVisible(false)}
        title="New Tag"
        placeholder="e.g. goa-trip, birthday, wfh"
        submitLabel="Add Tag"
        onSave={async (name) => {
          try {
            const { id } = await addTagMutation.mutateAsync(name);
            const current = form.getFieldValue("tagIds") ?? [];
            if (!current.includes(id)) {
              form.setFieldValue("tagIds", [...current, id]);
            }
            setNewTagSheetVisible(false);
            showSuccessToast("Tag added");
          } catch (err) {
            showErrorToast("Failed to add tag", err);
          }
        }}
      />

      {adders.sheets}

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

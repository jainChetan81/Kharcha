import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { FormLabel } from "@/components/ui/form-label";
import { InlineAddSheet } from "@/components/ui/inline-add-sheet";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAddCategory } from "@/hooks/use-categories";
import { useAddHolding, useAllHoldings } from "@/hooks/use-holdings";
import { useAddSource } from "@/hooks/use-sources";
import {
  COLORS,
  INSTRUMENT_TYPE,
  isUnitlessInstrument,
  QUERY_KEYS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { getAllSources, getCategoriesByType } from "@/lib/db";
import { showErrorToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  amountStringSchema,
  billingDayStringSchema,
  requiredStringSchema,
  validateField,
} from "@/lib/validation";

const BILLING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export type SubscriptionFormDefaults = {
  name?: string;
  amount?: string;
  billingDay?: string;
  categoryId?: number | null;
  sourceId?: number | null;
  type?: "expense" | "investment";
  holdingId?: number | null;
  defaultUnits?: string;
};

export type SubscriptionFormSubmitValue = {
  name: string;
  amount: number;
  billingDay: number;
  categoryId: number | null;
  sourceId: number | null;
  type: "expense" | "investment";
  holdingId: number | null;
  defaultUnits: number | null;
};

export function SubscriptionForm({
  onSubmit,
  defaultValues,
}: {
  onSubmit: (value: SubscriptionFormSubmitValue) => Promise<void>;
  defaultValues?: SubscriptionFormDefaults;
}) {
  const [newCategorySheetVisible, setNewCategorySheetVisible] = useState(false);
  const [newSourceSheetVisible, setNewSourceSheetVisible] = useState(false);
  const [newHoldingSheetVisible, setNewHoldingSheetVisible] = useState(false);
  const addCategoryMutation = useAddCategory();
  const addSourceMutation = useAddSource();
  const addHoldingMutation = useAddHolding();
  const { data: allHoldings = [] } = useAllHoldings();
  const openHoldings = allHoldings.filter((h) => h.is_closed === 0);

  const { data: categories = [] } = useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, TRANSACTION_TYPE.EXPENSE],
    queryFn: () => getCategoriesByType(TRANSACTION_TYPE.EXPENSE),
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
  });

  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      amount: defaultValues?.amount ?? "",
      billingDay: defaultValues?.billingDay ?? "",
      categoryId: (defaultValues?.categoryId ?? null) as number | null,
      sourceId: (defaultValues?.sourceId ?? null) as number | null,
      type: (defaultValues?.type ?? "expense") as "expense" | "investment",
      holdingId: (defaultValues?.holdingId ?? null) as number | null,
      defaultUnits: defaultValues?.defaultUnits ?? "",
    },
    onSubmit: async ({ value }) => {
      const isInvestment = value.type === "investment";
      await onSubmit({
        name: value.name,
        amount: Number(value.amount),
        billingDay: Number(value.billingDay),
        categoryId: isInvestment ? null : value.categoryId,
        sourceId: value.sourceId,
        type: value.type,
        holdingId: isInvestment ? value.holdingId : null,
        defaultUnits:
          isInvestment && value.defaultUnits
            ? Number(value.defaultUnits)
            : null,
      });
    },
  });

  return (
    <ScrollView
      className="flex-1 px-5 pt-4"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <form.Field
        name="name"
        validators={{
          onSubmit: ({ value }) =>
            validateField(requiredStringSchema("Name"), value),
        }}
      >
        {(field) => (
          <View className="mb-5">
            <FormLabel>Name</FormLabel>
            <Input
              placeholder="e.g. Netflix, Spotify"
              value={field.state.value}
              onChangeText={(v) => field.handleChange(v)}
              placeholderTextColor={COLORS.MUTED}
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
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

      <form.Field
        name="billingDay"
        validators={{
          onSubmit: ({ value }) => validateField(billingDayStringSchema, value),
        }}
      >
        {(field) => (
          <View className="mb-5">
            <FormLabel>Billing Day</FormLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingRight: 24 }}
            >
              {BILLING_DAYS.map((day) => {
                const selected = field.state.value === String(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => field.handleChange(String(day))}
                    className={cn(
                      "h-10 w-10 items-center justify-center rounded-full",
                      selected ? "bg-primary" : "border border-border bg-card",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        selected
                          ? "text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {field.state.value && Number(field.state.value) >= 1 && (
              <Text className="mt-2 text-xs text-muted-foreground">
                Renews on day {field.state.value} of every month
              </Text>
            )}
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      <form.Field name="type">
        {(field) => {
          const isSip = field.state.value === "investment";
          return (
            <View className="mb-5 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-medium text-foreground">
                  This is an SIP
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  Auto-post as an Investment Buy against a holding instead of an
                  expense.
                </Text>
              </View>
              <Switch
                value={isSip}
                onValueChange={(v) => {
                  field.handleChange(v ? "investment" : "expense");
                  if (v) {
                    form.setFieldValue("categoryId", null);
                  } else {
                    form.setFieldValue("holdingId", null);
                    form.setFieldValue("defaultUnits", "");
                  }
                }}
                trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
                thumbColor={COLORS.FOREGROUND}
              />
            </View>
          );
        }}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.type}>
        {(type) =>
          type === "investment" ? (
            <>
              <form.Field
                name="holdingId"
                validators={{
                  onSubmit: ({ value, fieldApi }) => {
                    if (fieldApi.form.getFieldValue("type") !== "investment")
                      return undefined;
                    return value ? undefined : "Holding is required";
                  },
                }}
              >
                {(field) => (
                  <View className="mb-5">
                    <FormLabel>Holding</FormLabel>
                    <ChipPicker
                      items={openHoldings.map((h) => ({
                        id: h.id,
                        name: h.name,
                      }))}
                      selectedId={field.state.value}
                      onSelect={(id) => field.handleChange(id)}
                      onAddNew={() => setNewHoldingSheetVisible(true)}
                      addLabel="New holding"
                    />
                    <FieldError errors={field.state.meta.errors as string[]} />
                  </View>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.holdingId}>
                {(holdingId) => {
                  const selectedHolding = openHoldings.find(
                    (h) => h.id === holdingId,
                  );
                  const unitless = selectedHolding
                    ? isUnitlessInstrument(selectedHolding.instrument_type)
                    : false;
                  if (unitless) return null;
                  return (
                    <form.Field name="defaultUnits">
                      {(field) => (
                        <View className="mb-5">
                          <FormLabel>
                            Default Units{" "}
                            <Text className="text-xs text-muted-foreground">
                              (optional — NAV varies, so edit after the fund
                              statement arrives)
                            </Text>
                          </FormLabel>
                          <Input
                            placeholder="0"
                            keyboardType="decimal-pad"
                            value={field.state.value}
                            onChangeText={(v) =>
                              field.handleChange(v.replace(/[^0-9.]/g, ""))
                            }
                            placeholderTextColor={COLORS.MUTED}
                          />
                        </View>
                      )}
                    </form.Field>
                  );
                }}
              </form.Subscribe>
            </>
          ) : (
            <form.Field name="categoryId">
              {(field) => (
                <View className="mb-5">
                  <FormLabel>Category</FormLabel>
                  <ChipPicker
                    items={categories}
                    selectedId={field.state.value}
                    onSelect={(id) => field.handleChange(id)}
                    allLabel="None"
                    onAddNew={() => setNewCategorySheetVisible(true)}
                    addLabel="New category"
                  />
                </View>
              )}
            </form.Field>
          )
        }
      </form.Subscribe>

      <form.Field name="sourceId">
        {(field) => (
          <View className="mb-5">
            <FormLabel>Source</FormLabel>
            <ChipPicker
              items={sources}
              selectedId={field.state.value}
              onSelect={(id) => field.handleChange(id)}
              onAddNew={() => setNewSourceSheetVisible(true)}
              addLabel="New source"
            />
          </View>
        )}
      </form.Field>

      <InlineAddSheet
        visible={newCategorySheetVisible}
        onClose={() => setNewCategorySheetVisible(false)}
        title="New Expense Category"
        placeholder="Category name"
        submitLabel="Add Category"
        mutateAsync={(name) =>
          addCategoryMutation.mutateAsync({
            name,
            type: TRANSACTION_TYPE.EXPENSE,
          })
        }
        onAdded={(id) => form.setFieldValue("categoryId", id)}
        addedToast="Category added"
        existingToast="Selected existing category"
        errorTitle="Failed to add category"
      />

      <InlineAddSheet
        visible={newSourceSheetVisible}
        onClose={() => setNewSourceSheetVisible(false)}
        title="New Source"
        placeholder="e.g. HDFC Credit, Paytm, UPI"
        submitLabel="Add Source"
        mutateAsync={(name) => addSourceMutation.mutateAsync(name)}
        onAdded={(id) => form.setFieldValue("sourceId", id)}
        addedToast="Source added"
        existingToast="Selected existing source"
        errorTitle="Failed to add source"
      />

      <InlineAddSheet
        visible={newHoldingSheetVisible}
        onClose={() => setNewHoldingSheetVisible(false)}
        title="New Holding"
        placeholder="e.g. Nippon Small Cap, PPF SBI"
        submitLabel="Add Holding"
        mutateAsync={(name) =>
          addHoldingMutation.mutateAsync({
            name,
            instrument_type: INSTRUMENT_TYPE.MUTUAL_FUND,
          })
        }
        onAdded={(id) => form.setFieldValue("holdingId", id)}
        addedToast="Holding added"
        existingToast="Selected existing holding"
        errorTitle="Failed to add holding"
      />

      <form.Subscribe
        selector={(state) => ({ isSubmitting: state.isSubmitting })}
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
                Add Subscription
              </Text>
            )}
          </Button>
        )}
      </form.Subscribe>
    </ScrollView>
  );
}

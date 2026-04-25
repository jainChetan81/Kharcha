import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAllHoldings } from "@/hooks/use-holdings";
import { useInlineAdders } from "@/hooks/use-inline-adders";
import {
  COLORS,
  isUnitlessInstrument,
  QUERY_KEYS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { getAllSources, getCategoriesByType } from "@/lib/db";
import { formatBillingDays } from "@/lib/db/subscriptions";
import { sanitizeDecimalInput } from "@/lib/format";
import { showErrorToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  amountStringSchema,
  billingDaysSchema,
  requiredStringSchema,
  validateField,
} from "@/lib/validation";

const BILLING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export type SubscriptionFormDefaults = {
  name?: string;
  amount?: string;
  billingDays?: number[];
  categoryId?: number | null;
  sourceId?: number | null;
  type?: "expense" | "investment";
  holdingId?: number | null;
  defaultUnits?: string;
};

export type SubscriptionFormSubmitValue = {
  name: string;
  amount: number;
  billingDays: number[];
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
      billingDays: (defaultValues?.billingDays ?? []) as number[],
      categoryId: (defaultValues?.categoryId ?? null) as number | null,
      sourceId: (defaultValues?.sourceId ?? null) as number | null,
      type: (defaultValues?.type ?? TRANSACTION_TYPE.EXPENSE) as
        | "expense"
        | "investment",
      holdingId: (defaultValues?.holdingId ?? null) as number | null,
      defaultUnits: defaultValues?.defaultUnits ?? "",
    },
    onSubmit: async ({ value }) => {
      const isInvestment = value.type === TRANSACTION_TYPE.INVESTMENT;
      await onSubmit({
        name: value.name,
        amount: Number(value.amount),
        billingDays: value.billingDays,
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

  const adders = useInlineAdders({
    categoryType: "expense",
    onCategoryAdded: (id) => form.setFieldValue("categoryId", id),
    onSourceAdded: (id) => form.setFieldValue("sourceId", id),
    onHoldingAdded: (id) => form.setFieldValue("holdingId", id),
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

      <form.Field
        name="billingDays"
        validators={{
          onSubmit: ({ value }) => validateField(billingDaysSchema, value),
        }}
      >
        {(field) => {
          const selectedDays = field.state.value;
          return (
            <View className="mb-5">
              <FormLabel>Billing Days</FormLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingRight: 24 }}
              >
                {BILLING_DAYS.map((day) => {
                  const selected = selectedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => {
                        const next = selected
                          ? selectedDays.filter((d) => d !== day)
                          : [...selectedDays, day].sort((a, b) => a - b);
                        field.handleChange(next);
                      }}
                      className={cn(
                        "h-10 w-10 items-center justify-center rounded-full",
                        selected
                          ? "bg-primary"
                          : "border border-border bg-card",
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
              {selectedDays.length > 0 && (
                <Text className="mt-2 text-xs text-muted-foreground">
                  Renews on {formatBillingDays(selectedDays)} of every month
                </Text>
              )}
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          );
        }}
      </form.Field>

      <form.Field name="type">
        {(field) => {
          const isSip = field.state.value === TRANSACTION_TYPE.INVESTMENT;
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
                  field.handleChange(
                    v ? TRANSACTION_TYPE.INVESTMENT : TRANSACTION_TYPE.EXPENSE,
                  );
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
          type === TRANSACTION_TYPE.INVESTMENT ? (
            <>
              <form.Field
                name="holdingId"
                validators={{
                  onSubmit: ({ value, fieldApi }) => {
                    if (
                      fieldApi.form.getFieldValue("type") !==
                      TRANSACTION_TYPE.INVESTMENT
                    )
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
                      onAddNew={adders.openHolding}
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
                              field.handleChange(sanitizeDecimalInput(v))
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
                    onAddNew={adders.openCategory}
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
              onAddNew={adders.openSource}
              addLabel="New source"
            />
          </View>
        )}
      </form.Field>

      {adders.sheets}

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

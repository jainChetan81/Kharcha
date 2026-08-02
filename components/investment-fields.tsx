import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";
import { Pressable, View } from "react-native";
import { ChipPicker } from "@/components/ui/chip-picker";
import { FieldError } from "@/components/ui/field-error";
import { FormLabel } from "@/components/ui/form-label";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  COLORS,
  INVESTMENT_KIND,
  type InvestmentKindType,
  isUnitlessInstrument,
} from "@/lib/constants";
import type { Holding } from "@/lib/db/types";
import { sanitizeDecimalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionFormValues } from "./transaction-form";

// TanStack Form's public type has 12 validator generics. TransactionForm's
// useForm({ defaultValues, onSubmit }) call passes no validators — its
// `onSubmit` is the submit handler (typed via `value`/`formApi`/`meta`,
// unrelated to the TOnSubmit *validator* generic below) — so every one of
// these 11 positions is uninferred and TypeScript widens each to its own
// declared bound: `FormValidateOrFn<T> | undefined` for the sync
// validators, `FormAsyncValidateOrFn<T> | undefined` for the async ones,
// and `unknown` for TSubmitMeta (no default on useForm's own signature).
// Confirmed against the real inferred type of `form` via a typecheck
// failure — this is not a guess.
type TxFormApi = ReactFormExtendedApi<
  TransactionFormValues,
  FormValidateOrFn<TransactionFormValues> | undefined, // onMount
  FormValidateOrFn<TransactionFormValues> | undefined, // onChange
  FormAsyncValidateOrFn<TransactionFormValues> | undefined, // onChangeAsync
  FormValidateOrFn<TransactionFormValues> | undefined, // onBlur
  FormAsyncValidateOrFn<TransactionFormValues> | undefined, // onBlurAsync
  FormValidateOrFn<TransactionFormValues> | undefined, // onSubmit (validator)
  FormAsyncValidateOrFn<TransactionFormValues> | undefined, // onSubmitAsync
  FormValidateOrFn<TransactionFormValues> | undefined, // onDynamic
  FormAsyncValidateOrFn<TransactionFormValues> | undefined, // onDynamicAsync
  FormAsyncValidateOrFn<TransactionFormValues> | undefined, // onServer
  unknown // submitMeta
>;

const KIND_OPTIONS: { key: InvestmentKindType; label: string }[] = [
  { key: INVESTMENT_KIND.BUY, label: "Buy" },
  { key: INVESTMENT_KIND.SELL, label: "Sell" },
  { key: INVESTMENT_KIND.DIVIDEND, label: "Dividend" },
  { key: INVESTMENT_KIND.INTEREST, label: "Interest" },
];

export function InvestmentFields({
  form,
  openHoldings,
  onAddNewHolding,
}: {
  form: TxFormApi;
  openHoldings: Holding[];
  onAddNewHolding: () => void;
}) {
  return (
    <>
      <form.Field
        name="holdingId"
        validators={{
          onSubmit: ({ value }) => (value ? undefined : "Holding is required"),
        }}
      >
        {(field) => (
          <View className="mb-5">
            <FormLabel>Holding</FormLabel>
            <ChipPicker
              items={openHoldings.map((h) => ({ id: h.id, name: h.name }))}
              selectedId={field.state.value}
              onSelect={(id) => field.handleChange(id)}
              onAddNew={onAddNewHolding}
              addLabel="New holding"
            />
            <FieldError errors={field.state.meta.errors as string[]} />
          </View>
        )}
      </form.Field>

      <form.Field name="investmentKind">
        {(field) => (
          <View className="mb-5">
            <FormLabel>Kind</FormLabel>
            <View className="flex-row gap-2">
              {KIND_OPTIONS.map((k) => {
                const selected = field.state.value === k.key;
                return (
                  <Pressable
                    key={k.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => field.handleChange(k.key)}
                    className={cn(
                      "flex-1 items-center rounded-xl py-2.5",
                      selected ? "bg-primary" : "bg-card",
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
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({
          kind: state.values.investmentKind,
          holdingId: state.values.holdingId,
        })}
      >
        {({ kind, holdingId }) => {
          const selectedHolding = openHoldings.find((h) => h.id === holdingId);
          const unitless = selectedHolding
            ? isUnitlessInstrument(selectedHolding.instrument_type)
            : false;
          const requiresUnits =
            !unitless &&
            (kind === INVESTMENT_KIND.BUY || kind === INVESTMENT_KIND.SELL);
          if (!requiresUnits) return null;
          return (
            <form.Field
              name="units"
              validators={{
                onSubmit: ({ value }) => {
                  const n = Number(value);
                  if (!value || !Number.isFinite(n) || n <= 0)
                    return "Units must be greater than 0";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <View className="mb-5">
                  <FormLabel>Units</FormLabel>
                  <Input
                    accessibilityLabel="Units"
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={field.state.value}
                    onChangeText={(v) =>
                      field.handleChange(sanitizeDecimalInput(v))
                    }
                    placeholderTextColor={COLORS.MUTED}
                  />
                  <FieldError errors={field.state.meta.errors as string[]} />
                </View>
              )}
            </form.Field>
          );
        }}
      </form.Subscribe>
    </>
  );
}

import type { ReactFormExtendedApi } from "@tanstack/react-form";
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
// useForm({ defaultValues, onSubmit }) call wires only onSubmit — every
// other validator slot (onMount/onChange/onChangeAsync/onBlur/onBlurAsync/
// onSubmitAsync/onDynamic/onDynamicAsync/onServer) is unset, so those
// positions type as `undefined` per FormOptions' own bound
// (`undefined | FormValidateOrFn<TFormData>`), and TSubmitMeta defaults to
// `never` when omitted (FormOptions' `TSubmitMeta = never`). Only onSubmit
// itself is left widened — reproducing its exact validator-fn signature
// here isn't worth the 200-char type for a field-rendering component that
// never calls submit.
type TxFormApi = ReactFormExtendedApi<
  TransactionFormValues,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  // biome-ignore lint/suspicious/noExplicitAny: onSubmit's real validator-fn type isn't worth reproducing here
  any,
  undefined,
  undefined,
  undefined,
  undefined,
  never
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

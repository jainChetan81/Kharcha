import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { ChipPicker } from "@/components/ui/chip-picker";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useEditSubscription } from "@/hooks/use-edit-subscription";
import { formatBillingDays, parseBillingDays } from "@/hooks/use-subscriptions";
import { COLORS, TRANSACTION_TYPE } from "@/lib/constants";
import { sanitizeDecimalInput } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";
import {
  amountStringSchema,
  requiredStringSchema,
  validateField,
} from "@/lib/validation";

export default function EditSubscriptionScreen() {
  const {
    subscription,
    isLoading,
    form,
    categories,
    sources,
    toggleActive,
    confirmDelete,
  } = useEditSubscription();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }

  if (!subscription) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Edit Subscription" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Subscription not found. It may have been deleted.
          </Text>
        </View>
      </View>
    );
  }

  const billingDays = parseBillingDays(
    subscription.billing_days,
    subscription.billing_day,
  );

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-3",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary-text">
            Cancel
          </Text>
        </Pressable>
        <Text className="text-lg font-bold text-foreground">
          Edit Subscription
        </Text>
        <View className="w-14" />
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <Text className="text-sm font-medium text-foreground">Active</Text>
          <Switch
            value={subscription.is_active === 1}
            onValueChange={toggleActive}
            trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
            thumbColor={COLORS.FOREGROUND}
            accessibilityLabel="Active"
          />
        </View>

        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) =>
              validateField(requiredStringSchema("Name"), value),
          }}
        >
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Name
              </Text>
              <Input
                value={field.state.value}
                onChangeText={(v) => field.handleChange(v)}
                placeholderTextColor={COLORS.MUTED}
                accessibilityLabel="Name"
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
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Amount
              </Text>
              <Input
                keyboardType="decimal-pad"
                value={field.state.value}
                onChangeText={(v) => {
                  field.handleChange(sanitizeDecimalInput(v));
                }}
                className="h-14 text-2xl font-bold"
                placeholderTextColor={COLORS.MUTED}
                accessibilityLabel="Amount"
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        <View className="mb-5">
          <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
            Billing {billingDays.length === 1 ? "Day" : "Days"}
          </Text>
          <View className="flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
            <Text className="flex-1 text-sm text-foreground">
              {formatBillingDays(billingDays, { capitalize: true })} of every
              month
            </Text>
          </View>
          <Text className="mt-1.5 text-xs text-muted-foreground">
            To change billing days, delete and recreate the subscription
          </Text>
        </View>

        {subscription.type !== TRANSACTION_TYPE.INVESTMENT && (
          <form.Field name="categoryId">
            {(field) => (
              <View className="mb-5">
                <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                  Category
                </Text>
                <ChipPicker
                  items={categories}
                  selectedId={field.state.value}
                  onSelect={(id) => field.handleChange(id)}
                  allLabel="None"
                />
              </View>
            )}
          </form.Field>
        )}

        <form.Field name="sourceId">
          {(field) => (
            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
                Source
              </Text>
              <ChipPicker
                items={sources}
                selectedId={field.state.value}
                onSelect={(id) => field.handleChange(id)}
              />
            </View>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({ isSubmitting: state.isSubmitting })}
        >
          {({ isSubmitting }) => (
            <View className="mb-6 flex-row gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-2xl border-negative"
                onPress={confirmDelete}
              >
                <Text className="text-base font-semibold text-negative-text">
                  Delete
                </Text>
              </Button>
              <Button
                className="h-12 flex-1 rounded-2xl bg-primary"
                disabled={isSubmitting}
                onPress={() => form.handleSubmit()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={COLORS.WHITE} />
                ) : (
                  <Text className="text-base font-semibold text-primary-foreground">
                    Save Changes
                  </Text>
                )}
              </Button>
            </View>
          )}
        </form.Subscribe>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

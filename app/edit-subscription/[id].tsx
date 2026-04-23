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
import { Text } from "@/components/ui/text";
import { useEditSubscription } from "@/hooks/use-edit-subscription";
import { COLORS } from "@/lib/constants";
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

  if (isLoading || !subscription) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-3",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="py-1 pr-4">
          <Text className="text-base font-semibold text-primary">Cancel</Text>
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
                  field.handleChange(v.replace(/[^0-9.]/g, ""));
                }}
                className="h-14 text-2xl font-bold"
                placeholderTextColor={COLORS.MUTED}
              />
              <FieldError errors={field.state.meta.errors as string[]} />
            </View>
          )}
        </form.Field>

        <View className="mb-5">
          <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
            Billing Day
          </Text>
          <View className="flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
            <Text className="flex-1 text-sm text-foreground">
              Day {subscription.billing_day} of every month
            </Text>
          </View>
          <Text className="mt-1.5 text-xs text-muted-foreground">
            To change billing day, delete and recreate the subscription
          </Text>
        </View>

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
                <Text className="text-base font-semibold text-negative">
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

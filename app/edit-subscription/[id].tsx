import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
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
import {
  useSubscriptionById,
  useToggleSubscription,
  useUpdateSubscription,
} from "@/hooks/use-subscriptions";
import { COLORS, QUERY_KEYS } from "@/lib/constants";
import { getAllSources, getCategoriesByType } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

export default function EditSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subscriptionId = Number(id);

  const { data: subscription, isLoading } = useSubscriptionById(subscriptionId);
  const updateMutation = useUpdateSubscription();
  const toggleMutation = useToggleSubscription();

  const { data: categories = [] } = useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, "expense"],
    queryFn: () => getCategoriesByType("expense"),
  });

  const { data: sources = [] } = useQuery({
    queryKey: [QUERY_KEYS.SOURCES],
    queryFn: getAllSources,
  });

  const form = useForm({
    defaultValues: {
      name: subscription?.name ?? "",
      amount: subscription ? String(subscription.amount) : "",
      categoryId: (subscription?.category_id ?? null) as number | null,
      sourceId: (subscription?.source_id ?? null) as number | null,
    },
    onSubmit: async ({ value }) => {
      if (!subscription) return;
      const amount = Number(value.amount);
      if (!value.name.trim() || amount <= 0) return;

      try {
        await updateMutation.mutateAsync({
          id: subscriptionId,
          name: value.name.trim(),
          amount,
          billingDay: subscription.billing_day,
          categoryId: value.categoryId,
          sourceId: value.sourceId,
        });
        showSuccessToast("Subscription updated");
        router.back();
      } catch (err) {
        showErrorToast("Failed to update", err);
      }
    },
  });

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
            onValueChange={(val) =>
              toggleMutation.mutate({
                id: subscriptionId,
                isActive: val,
              })
            }
            trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
            thumbColor={COLORS.FOREGROUND}
          />
        </View>

        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => {
              if (!value.trim()) return "Name is required";
              return undefined;
            },
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
                keyboardType="decimal-pad"
                value={field.state.value}
                onChangeText={(v) => {
                  field.handleChange(v.replace(/[^0-9.]/g, ""));
                }}
                className="text-lg font-semibold"
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
            <Button
              className="mb-6 h-12 rounded-2xl bg-primary"
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
          )}
        </form.Subscribe>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const ErrorBoundary = ScreenError;

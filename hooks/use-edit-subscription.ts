import { useForm } from "@tanstack/react-form";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCategoriesByType } from "@/hooks/use-categories";
import { useAllSources } from "@/hooks/use-sources";
import {
  useDeleteSubscription,
  useSubscriptionById,
  useToggleSubscription,
  useUpdateSubscription,
} from "@/hooks/use-subscriptions";
import { showDeleteConfirm } from "@/lib/alerts";
import { TRANSACTION_TYPE } from "@/lib/constants";
import { parseBillingDays } from "@/lib/db/subscriptions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function useEditSubscription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subscriptionId = Number(id);

  const { data: subscription, isLoading } = useSubscriptionById(subscriptionId);
  const updateMutation = useUpdateSubscription();
  const deleteMutation = useDeleteSubscription();
  const toggleMutation = useToggleSubscription();

  const { data: categories = [] } = useCategoriesByType(
    TRANSACTION_TYPE.EXPENSE,
  );
  const { data: sources = [] } = useAllSources();

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
          billingDays: parseBillingDays(
            subscription.billing_days,
            subscription.billing_day,
          ),
          categoryId: value.categoryId,
          sourceId: value.sourceId,
          // Preserve SIP identity on edit — the UI here doesn't let the user
          // flip expense↔investment, so carry the stored type + holding link
          // through unchanged. (Conversion would require delete + recreate.)
          type: subscription.type,
          holdingId: subscription.holding_id,
          investmentKind: subscription.investment_kind,
          defaultUnits: subscription.default_units,
        });
        showSuccessToast("Subscription updated");
        router.back();
      } catch (err) {
        showErrorToast("Failed to update", err);
      }
    },
  });

  function toggleActive(isActive: boolean) {
    Haptics.selectionAsync();
    toggleMutation.mutate({ id: subscriptionId, isActive });
  }

  function confirmDelete() {
    showDeleteConfirm(
      "Delete Subscription",
      "This cannot be undone.",
      async () => {
        try {
          await deleteMutation.mutateAsync(subscriptionId);
          showSuccessToast("Subscription deleted");
          router.back();
        } catch (err) {
          showErrorToast("Failed to delete", err);
        }
      },
    );
  }

  return {
    subscription,
    isLoading,
    form,
    categories,
    sources,
    toggleActive,
    confirmDelete,
  };
}

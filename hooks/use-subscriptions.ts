import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addSubscription,
  deleteSubscription,
  getActiveSubscriptions,
  getActiveSubscriptionsTotal,
  getSubscriptionById,
  getSubscriptions,
  getUnusedSubscriptions,
  type SubscriptionAuditRow,
  type SubscriptionRow,
  toggleSubscription,
  updateSubscription,
} from "@/lib/db/subscriptions";
import { useInvalidateTransactions } from "./use-transactions";

export type { SubscriptionAuditRow, SubscriptionRow };

function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.SUBSCRIPTIONS],
      }),
      invalidateTransactions(),
    ]);
  };
}

export function useSubscriptions() {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS],
    queryFn: getSubscriptions,
  });
}

export function useSubscriptionById(id: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS, id],
    queryFn: () => getSubscriptionById(id),
    enabled: !!id,
  });
}

export function useSubscriptionsTotal() {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS, "total"],
    queryFn: getActiveSubscriptionsTotal,
  });
}

export function useAddSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: addSubscription,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({
      id,
      ...params
    }: {
      id: number;
      name: string;
      amount: number;
      billingDay: number;
      categoryId: number | null;
      sourceId: number | null;
    }) => updateSubscription(id, params),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: (id: number) => deleteSubscription(id),
    onSuccess: () => invalidate(),
  });
}

export function useToggleSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      toggleSubscription(id, isActive),
    onSuccess: () => invalidate(),
  });
}

export function useUnusedSubscriptions() {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS, "unused"],
    queryFn: getUnusedSubscriptions,
  });
}

export function useActiveSubscriptions() {
  return useQuery({
    queryKey: [QUERY_KEYS.SUBSCRIPTIONS, "active"],
    queryFn: getActiveSubscriptions,
  });
}

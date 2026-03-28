import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addSubscription,
  deleteSubscription,
  getActiveSubscriptionsTotal,
  getSubscriptionById,
  getSubscriptions,
  type SubscriptionRow,
  toggleSubscription,
  updateSubscription,
} from "@/lib/db/subscriptions";

export type { SubscriptionRow };

function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.SUBSCRIPTIONS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      }),
    ]);
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

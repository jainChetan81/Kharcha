import { useMemo, useState } from "react";
import {
  useReimbursementSummary,
  useSetReimbursementStatus,
  useTransactionsPaginated,
} from "@/hooks/use-transactions";
import {
  REIMBURSEMENT_FILTER,
  REIMBURSEMENT_STATUS,
  type ReimbursementFilterType,
} from "@/lib/constants";
import { buildListData, type ListItem } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type PendingOrReimbursed = Exclude<ReimbursementFilterType, "all">;

export type UseReimbursementListReturn = {
  tab: PendingOrReimbursed;
  setTab: (tab: PendingOrReimbursed) => void;
  isPendingTab: boolean;
  pendingCount: number;
  pendingTotal: number;
  reimbursedCount: number;
  reimbursedTotal: number;
  listData: ListItem[];
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  error: Error | null;
  markReimbursed: (id: number) => Promise<void>;
  markPending: (id: number) => Promise<void>;
};

export function useReimbursementList(): UseReimbursementListReturn {
  const { data: summary } = useReimbursementSummary();
  const setStatus = useSetReimbursementStatus();

  const [tab, setTab] = useState<Exclude<ReimbursementFilterType, "all">>(
    REIMBURSEMENT_FILTER.PENDING,
  );

  const filters = useMemo(
    () => ({
      type: "expense" as const,
      reimbursement: tab,
    }),
    [tab],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useTransactionsPaginated(filters);

  const allTransactions = data?.pages.flat() ?? [];
  const listData = buildListData(allTransactions);

  async function markReimbursed(id: number) {
    try {
      await setStatus.mutateAsync({
        id,
        status: REIMBURSEMENT_STATUS.REIMBURSED,
      });
      showSuccessToast("Marked as reimbursed");
    } catch (err) {
      showErrorToast("Failed", err);
    }
  }

  async function markPending(id: number) {
    try {
      await setStatus.mutateAsync({
        id,
        status: REIMBURSEMENT_STATUS.PENDING,
      });
      showSuccessToast("Moved back to pending");
    } catch (err) {
      showErrorToast("Failed", err);
    }
  }

  return {
    tab,
    setTab,
    isPendingTab: tab === REIMBURSEMENT_FILTER.PENDING,
    pendingCount: summary?.pending_count ?? 0,
    pendingTotal: summary?.pending_total ?? 0,
    reimbursedCount: summary?.reimbursed_count ?? 0,
    reimbursedTotal: summary?.reimbursed_total ?? 0,
    listData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    markReimbursed,
    markPending,
  };
}

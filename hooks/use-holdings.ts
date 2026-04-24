import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addHolding,
  closeHolding,
  deleteHolding,
  getAllHoldings,
  getHolding,
  getPortfolioSummary,
  getPortfolioSummaryForMonth,
  getTransactionsForHolding,
  reopenHolding,
  updateHolding,
} from "@/lib/db";
import type { InstrumentType } from "@/lib/db/types";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";

export function useAllHoldings(enabled = true) {
  return useQuery({
    queryKey: [QUERY_KEYS.HOLDINGS],
    queryFn: getAllHoldings,
    enabled,
  });
}

export function useHolding(id: number | null) {
  return useQuery({
    queryKey: [QUERY_KEYS.HOLDING, id],
    queryFn: () => (id ? getHolding(id) : null),
    enabled: id != null,
  });
}

export function useHoldingTransactions(id: number | null) {
  return useQuery({
    queryKey: [QUERY_KEYS.HOLDING_TRANSACTIONS, id],
    queryFn: () => (id ? getTransactionsForHolding(id) : []),
    enabled: id != null,
  });
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: [QUERY_KEYS.PORTFOLIO_SUMMARY],
    queryFn: getPortfolioSummary,
  });
}

export function usePortfolioSummaryForMonth(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.PORTFOLIO_MONTH_SUMMARY, yearMonth],
    queryFn: () => getPortfolioSummaryForMonth(yearMonth),
  });
}

function invalidatePortfolio(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.HOLDINGS] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.HOLDING] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.HOLDING_TRANSACTIONS] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.PORTFOLIO_SUMMARY] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.PORTFOLIO_MONTH_SUMMARY] });
}

export function useAddHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      instrument_type: InstrumentType;
      note?: string | null;
    }) => addHolding(input),
    onSuccess: ({ isNew }, input) => {
      if (isNew) {
        logEvent(FIREBASE_EVENTS.HOLDING_ADDED, {
          instrument_type: input.instrument_type,
        });
      }
      invalidatePortfolio(qc);
    },
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: {
        name?: string;
        instrument_type?: InstrumentType;
        note?: string | null;
      };
    }) => updateHolding(id, patch),
    onSuccess: () => invalidatePortfolio(qc),
  });
}

export function useCloseHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => closeHolding(id),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.HOLDING_CLOSED);
      invalidatePortfolio(qc);
    },
  });
}

export function useReopenHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reopenHolding(id),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.HOLDING_REOPENED);
      invalidatePortfolio(qc);
    },
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteHolding(id),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.HOLDING_DELETED);
      invalidatePortfolio(qc);
    },
  });
}

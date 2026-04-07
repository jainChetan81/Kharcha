import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/constants";
import {
  addBank,
  addBankEmail,
  deleteBank,
  deleteBankEmail,
  getAllBanksWithEmails,
  setBankActive,
} from "@/lib/db";

export function useBanksWithEmails() {
  return useQuery({
    queryKey: [QUERY_KEYS.BANKS],
    queryFn: getAllBanksWithEmails,
  });
}

export function useAddBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      email,
      parserKey,
    }: {
      name: string;
      email: string;
      parserKey?: string | null;
    }) =>
      addBank(name, parserKey ?? null).then((bankId) =>
        addBankEmail(bankId, email),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEYS.BANKS] });
    },
  });
}

export function useSetBankActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      setBankActive(id, active),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEYS.BANKS] });
    },
  });
}

export function useAddBankEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankId, email }: { bankId: number; email: string }) =>
      addBankEmail(bankId, email),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEYS.BANKS] });
    },
  });
}

export function useDeleteBankEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteBankEmail(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEYS.BANKS] });
    },
  });
}

export function useDeleteBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteBank(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [QUERY_KEYS.BANKS] });
    },
  });
}

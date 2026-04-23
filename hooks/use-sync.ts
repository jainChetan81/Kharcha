import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { insertTransaction, syncedTransactionExists } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import {
  apiFetchAuthed,
  DEVICE_PLATFORM,
  getOrCreateDeviceId,
  registerDevice,
} from "@/lib/device";
import { env } from "@/lib/env";
import { FIREBASE_EVENTS, logEvent, withTrace } from "@/lib/firebase";
import { parseErrorResponse } from "@/lib/firebase/api-fetch";

type BackendTransaction = {
  id: string;
  device_id: string;
  amount: number;
  merchant: string | null;
  category: string | null;
  date: string;
  type: "income" | "expense";
  source: string | null;
  source_type: string | null;
  note: string | null;
  created_at: string;
  fetched_at: string | null;
};

type SyncResponse = {
  transactions: BackendTransaction[];
  last_synced_at: string;
};

export function useDeviceSyncConfig() {
  return useQuery({
    queryKey: [QUERY_KEYS.CONFIG, QUERY_KEYS.DEVICE_SYNC_CONFIG],
    queryFn: async () => {
      const [deviceId, forwardingEmail, lastSyncedAt] = await Promise.all([
        getOrCreateDeviceId(),
        getConfig(CONFIG_KEYS.BACKEND_FORWARDING_EMAIL),
        getConfig(CONFIG_KEYS.BACKEND_LAST_SYNCED_AT),
      ]);
      return { deviceId, forwardingEmail, lastSyncedAt };
    },
  });
}

export function useRegisterDevice() {
  const queryClient = useQueryClient();
  const { data: settings } = useDeviceSyncConfig();

  return useMutation({
    mutationFn: async (name?: string) => {
      const deviceId = settings?.deviceId;
      if (!deviceId) throw new Error("No device ID");

      return registerDevice(deviceId, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONFIG, QUERY_KEYS.DEVICE_SYNC_CONFIG],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.FEATURE_FLAGS],
      });
    },
  });
}

export function useUpdateDeviceName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetchAuthed(`${env.API_URL}/device/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, platform: DEVICE_PLATFORM }),
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to update name"));
      }

      return (await res.json()) as { name: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.FEATURE_FLAGS],
      });
    },
  });
}

export function useDeviceSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (syncFromDate: Date) => {
      return withTrace("device_sync", async () => {
        const params = new URLSearchParams();
        const startOfMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        );
        if (syncFromDate.getTime() !== startOfMonth.getTime()) {
          params.set("last_synced_at", syncFromDate.toISOString());
        }

        const url = `${env.API_URL}/sync${params.toString() ? `?${params}` : ""}`;
        const res = await apiFetchAuthed(url);

        if (!res.ok) {
          throw new Error(await parseErrorResponse(res, "Sync failed"));
        }

        const data = (await res.json()) as SyncResponse;

        const existenceChecks = await Promise.all(
          data.transactions.map((tx) =>
            syncedTransactionExists(tx.date, tx.amount),
          ),
        );

        const toInsert = data.transactions.filter(
          (_, i) => !existenceChecks[i],
        );
        const skipped = data.transactions.length - toInsert.length;

        for (const tx of toInsert) {
          await insertTransaction({
            type: tx.type,
            amount: tx.amount,
            merchant: tx.merchant,
            categoryId: null,
            sourceId: null,
            sourceType: "synced",
            date: tx.date,
            note: tx.note,
          });
        }

        const inserted = toInsert.length;

        await updateConfig(
          CONFIG_KEYS.BACKEND_LAST_SYNCED_AT,
          data.last_synced_at,
        );

        return { inserted, skipped, total: data.transactions.length };
      });
    },
    onSuccess: (data) => {
      logEvent(FIREBASE_EVENTS.DEVICE_SYNC_COMPLETED, {
        count: String(data.inserted),
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONFIG, QUERY_KEYS.DEVICE_SYNC_CONFIG],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CATEGORY_BREAKDOWN],
      });
    },
  });
}

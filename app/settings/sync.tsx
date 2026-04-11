import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { getAndroidId, getIosIdForVendorAsync } from "expo-application";
import * as Clipboard from "expo-clipboard";
import { lazy, Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";

const SyncResultsSheet = lazy(() =>
  import("@/components/sync-results-sheet").then((m) => ({
    default: m.SyncResultsSheet,
  })),
);
const DatePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DatePickerModal,
  })),
);

import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { COLORS, CONFIG_KEYS, DATE_FORMAT, QUERY_KEYS } from "@/lib/constants";
import { insertTransaction, syncedTransactionExists } from "@/lib/db";
import { getConfig, updateConfig } from "@/lib/db/config";
import { env } from "@/lib/env";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { isIOS } from "@/lib/utils";

async function parseErrorResponse(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? fallback;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

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

type SyncResult = {
  inserted: number;
  skipped: number;
  total: number;
};

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getConfig(CONFIG_KEYS.DEVICE_ID);
  if (existing) return existing;

  const vendorId = isIOS ? await getIosIdForVendorAsync() : getAndroidId();
  const id = `kharcha-${vendorId ?? crypto.randomUUID()}`;
  await updateConfig(CONFIG_KEYS.DEVICE_ID, id);
  return id;
}

export default function DeviceSyncScreen() {
  const queryClient = useQueryClient();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  const { data: settings, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.CONFIG, "device-sync"],
    queryFn: async () => {
      const [deviceId, forwardingEmail, lastSyncedAt] = await Promise.all([
        getOrCreateDeviceId(),
        getConfig(CONFIG_KEYS.BACKEND_FORWARDING_EMAIL),
        getConfig(CONFIG_KEYS.BACKEND_LAST_SYNCED_AT),
      ]);
      return { deviceId, forwardingEmail, lastSyncedAt };
    },
  });

  const isRegistered = !!settings?.forwardingEmail;

  useEffect(() => {
    if (!settings?.lastSyncedAt) return;
    const stored = new Date(settings.lastSyncedAt);
    if (!Number.isNaN(stored.getTime())) {
      setSyncFromDate(stored);
    }
  }, [settings?.lastSyncedAt]);

  async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    setShowDatePicker(false);
    await updateConfig(CONFIG_KEYS.BACKEND_LAST_SYNCED_AT, date.toISOString());
    queryClient.invalidateQueries({
      queryKey: [QUERY_KEYS.CONFIG, "device-sync"],
    });
  }

  const registerMutation = useMutation({
    mutationFn: async () => {
      const deviceId = settings?.deviceId;
      if (!deviceId) throw new Error("No device ID");

      const res = await fetch(`${env.API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId }),
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Registration failed"));
      }

      const data = (await res.json()) as { forwarding_email: string };

      await updateConfig(
        CONFIG_KEYS.BACKEND_FORWARDING_EMAIL,
        data.forwarding_email,
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONFIG, "device-sync"],
      });
      showSuccessToast("Device registered");
    },
    onError: (err) => showErrorToast("Registration failed", err),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const deviceId = settings?.deviceId;
      if (!deviceId) throw new Error("Not registered");

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
      const res = await fetch(url, {
        headers: { "x-device-id": deviceId },
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Sync failed"));
      }

      const data = (await res.json()) as SyncResponse;

      let inserted = 0;
      let skipped = 0;

      for (const tx of data.transactions) {
        const exists = await syncedTransactionExists(tx.date, tx.amount);
        if (exists) {
          skipped++;
          continue;
        }

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
        inserted++;
      }

      await updateConfig(
        CONFIG_KEYS.BACKEND_LAST_SYNCED_AT,
        data.last_synced_at,
      );

      return { inserted, skipped, total: data.transactions.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.CONFIG, "device-sync"],
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

      setSyncResult(result);
      setShowResults(true);
    },
    onError: (err) => showErrorToast("Sync failed", err),
  });

  const busy =
    isLoading || registerMutation.isPending || syncMutation.isPending;

  async function handleCopyToClipboard(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    showSuccessToast(`${label} copied`);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Device Sync" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <SectionHeader title="User ID" />
          <Pressable
            onPress={() => {
              if (settings?.deviceId)
                handleCopyToClipboard(settings.deviceId, "User ID");
            }}
            className="mx-5 mb-2 items-center rounded-xl border border-border bg-card px-4 py-4"
          >
            <Text className="text-center font-mono text-sm text-muted-foreground">
              {settings?.deviceId ?? "—"}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground/60">
              Tap to copy
            </Text>
          </Pressable>

          <SectionHeader title="Registration" />
          <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
            <View
              className={`mr-3 h-2.5 w-2.5 rounded-full ${isRegistered ? "bg-positive" : "bg-negative"}`}
            />
            <Text className="flex-1 text-sm font-medium text-foreground">
              {isRegistered ? "Registered" : "Not Registered"}
            </Text>
          </View>

          {isRegistered && settings?.forwardingEmail && (
            <Pressable
              onPress={() =>
                handleCopyToClipboard(
                  settings.forwardingEmail ?? "",
                  "Forwarding email",
                )
              }
              className="mx-5 mb-2 items-center rounded-xl border border-border bg-card px-4 py-4"
            >
              <Text className="text-center font-mono text-sm text-muted-foreground">
                {settings.forwardingEmail}
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground/60">
                Tap to copy
              </Text>
            </Pressable>
          )}

          {!isRegistered && (
            <View className="mx-5 mt-4">
              <Button
                className="h-12 rounded-xl bg-primary"
                onPress={() => registerMutation.mutate()}
                disabled={busy}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.WHITE}
                    className="mr-2"
                  />
                ) : null}
                <Text className="text-sm font-semibold text-primary-foreground">
                  {registerMutation.isPending
                    ? "Registering..."
                    : "Register Device"}
                </Text>
              </Button>
            </View>
          )}

          {isRegistered && (
            <>
              <SectionHeader title="Sync" />
              <InfoRow
                label="Last Synced"
                value={
                  settings?.lastSyncedAt
                    ? `${formatDistanceToNow(new Date(settings.lastSyncedAt))} ago`
                    : "Never"
                }
              />

              <SectionHeader title="Sync From" />
              <Pressable
                onPress={() => setShowDatePicker(!showDatePicker)}
                className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
              >
                <Text className="flex-1 text-sm font-medium text-foreground">
                  Fetch transactions after
                </Text>
                <Text className="text-sm text-primary">
                  {format(syncFromDate, DATE_FORMAT)}
                </Text>
              </Pressable>
              <Suspense fallback={null}>
                <DatePickerModal
                  visible={showDatePicker}
                  value={syncFromDate}
                  title="Fetch Transactions After"
                  maximumDate={new Date()}
                  onConfirm={(date) => {
                    setShowDatePicker(false);
                    handleUpdateSyncFrom(date);
                  }}
                  onCancel={() => setShowDatePicker(false)}
                />
              </Suspense>

              <View className="mx-5 mt-4">
                <Button
                  className="h-12 rounded-xl bg-primary"
                  onPress={() => syncMutation.mutate()}
                  disabled={busy}
                >
                  {syncMutation.isPending ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.WHITE}
                      className="mr-2"
                    />
                  ) : null}
                  <Text className="text-sm font-semibold text-primary-foreground">
                    {syncMutation.isPending ? "Syncing..." : "Sync Now"}
                  </Text>
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Suspense fallback={null}>
        <SyncResultsSheet
          visible={showResults}
          onClose={() => setShowResults(false)}
          subtitle={
            syncResult
              ? `${syncResult.total} transaction${syncResult.total !== 1 ? "s" : ""} found`
              : undefined
          }
          emptyMessage="Already up to date"
          stats={
            syncResult
              ? [
                  {
                    label: "Added",
                    count: syncResult.inserted,
                    color: COLORS.POSITIVE,
                  },
                  {
                    label: "Duplicates skipped",
                    count: syncResult.skipped,
                    color: COLORS.MUTED,
                  },
                ]
              : []
          }
          showViewButton={!!syncResult && syncResult.inserted > 0}
        />
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

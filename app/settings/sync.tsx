import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { lazy, Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StepCard } from "@/components/ui/step-card";
import { SwitchRow } from "@/components/ui/switch-row";
import { Text } from "@/components/ui/text";
import {
  useAutoRefreshPrefs,
  useSetAutoRefreshPref,
} from "@/hooks/use-auto-refresh-prefs";
import {
  useDeviceSync,
  useDeviceSyncConfig,
  useRegisterDevice,
} from "@/hooks/use-sync";
import { copyToClipboard } from "@/lib/clipboard";
import {
  COLORS,
  CONFIG_KEYS,
  DATE_FORMAT,
  QUERY_KEYS,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { updateConfig } from "@/lib/db/config";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

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

export default function DeviceSyncScreen() {
  const queryClient = useQueryClient();
  const [syncResult, setSyncResult] = useState<{
    inserted: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  const { data: settings, isLoading } = useDeviceSyncConfig();

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
      queryKey: [QUERY_KEYS.CONFIG, QUERY_KEYS.DEVICE_SYNC_CONFIG],
    });
  }

  const registerMutation = useRegisterDevice();
  const syncMutation = useDeviceSync();
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const setAutoRefreshPref = useSetAutoRefreshPref();

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync(syncFromDate);
      setSyncResult(result);
      setShowResults(true);
      showSuccessToast("Sync completed");
    } catch (err) {
      showErrorToast("Sync failed", err);
    }
  };

  const handleRegister = async () => {
    try {
      await registerMutation.mutateAsync(undefined);
      showSuccessToast("Device registered");
    } catch (err) {
      showErrorToast("Registration failed", err);
    }
  };

  const busy =
    isLoading || registerMutation.isPending || syncMutation.isPending;

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
          contentContainerStyle={SCROLL_BOTTOM_PADDING}
        >
          <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
            Device Sync pulls transactions from your personal forwarding inbox.
            Your bank emails forward there, our backend parses them, and this
            device pulls the results. Set up Gmail forwarding once — see the
            steps at the bottom of this screen.
          </Text>

          <SectionHeader title="User ID" />
          <Pressable
            onPress={() => {
              if (settings?.deviceId)
                copyToClipboard(settings.deviceId, "User ID");
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
                copyToClipboard(
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
                onPress={handleRegister}
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

              <SwitchRow
                label="Enable Device Sync"
                description="Turn off to pause all Device syncing — manual and automatic."
                value={autoRefreshPrefs?.device ?? false}
                onValueChange={(next) =>
                  setAutoRefreshPref.mutate({ key: "device", enabled: next })
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
                  onPress={handleSync}
                  disabled={busy || !autoRefreshPrefs?.device}
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

              <SectionHeader
                title="Set up Gmail forwarding"
                description="Follow these steps once to let bank emails flow into your forwarding inbox."
              />
              <View className="mx-5 mb-2 flex-row gap-3">
                <StepCard
                  step="1"
                  title="Copy address"
                  body="Tap your forwarding email above to copy it."
                />
                <StepCard
                  step="2"
                  title="Gmail Settings"
                  body="Open Gmail on web → Settings → Forwarding and POP/IMAP."
                />
              </View>
              <View className="mx-5 mb-2 flex-row gap-3">
                <StepCard
                  step="3"
                  title="Add address"
                  body="Click 'Add a forwarding address' and paste the copied email. Confirm it."
                />
                <StepCard
                  step="4"
                  title="Create filter"
                  body="Go to Filters → Create filter → From: your bank's email (e.g. alerts@hdfcbank.net)."
                />
              </View>
              <View className="mx-5 mb-2 flex-row gap-3">
                <StepCard
                  step="5"
                  title="Forward to"
                  body="Check 'Forward it to' and pick your Kharcha forwarding address. Save."
                />
                <StepCard
                  step="6"
                  title="Repeat"
                  body="Add one filter per bank. New transactions flow in within a few minutes."
                />
              </View>
              <Text className="mx-5 mb-2 mt-2 text-[11px] text-muted-foreground">
                Only emails that match your filter rules are forwarded. Gmail
                keeps the originals; nothing is deleted.
              </Text>
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

import { format, formatDistanceToNow, subMonths } from "date-fns";
import { router } from "expo-router";
import { ChevronRight, Copy, Landmark } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
import { useBanksWithEmails } from "@/hooks/use-banks";
import { useGmailSync, useGmailSyncConfig } from "@/hooks/use-gmail-sync";
import { useSyncState } from "@/hooks/use-sync-state";
import { copyMaskedToClipboard } from "@/lib/clipboard";
import {
  COLORS,
  CONFIG_KEYS,
  DATE_DISPLAY_FORMAT,
  EMAIL_LOG_STATUS,
  GMAIL_API,
  GMAIL_SYNC_MAX_MONTHS_BACK,
  SCREENS,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";
import type { EmailLog, SyncResult } from "@/lib/gmail/sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SyncResultsSheet = lazy(() =>
  import("@/components/sync-results-sheet").then((m) => ({
    default: m.SyncResultsSheet,
  })),
);
const DateTimePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DateTimePickerModal,
  })),
);

export default function GmailSyncScreen() {
  const { signIn, signOut, getValidAccessToken } = useGoogleAuth();
  const {
    connected,
    setConnected,
    lastSynced,
    setLastSynced,
    emailsFetched,
    setEmailsFetched,
    transactionsAdded,
    setTransactionsAdded,
    loading,
    syncFromDate,
    setSyncFromDate,
  } = useSyncState();
  const [email, setEmail] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { data: banksData = [] } = useBanksWithEmails();
  const activeBanks = banksData.filter(
    (b) => b.is_active === 1 && b.emails.length > 0,
  );
  const noActiveBanks = activeBanks.length === 0;
  const gmailSyncConfig = useGmailSyncConfig();
  const gmailSyncMutation = useGmailSync();
  const syncing = gmailSyncMutation.isPending;
  const busy = loading || syncing || verifying;
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const setAutoRefreshPref = useSetAutoRefreshPref();

  const emailToBankName = new Map<string, string>();
  for (const b of banksData) {
    for (const e of b.emails)
      emailToBankName.set(e.email.toLowerCase(), b.name);
  }

  function lookupBankName(from: string): string {
    return (
      emailToBankName.get(from.toLowerCase()) ?? from.split("@")[0] ?? from
    );
  }

  async function handleConnect() {
    try {
      const success = await signIn();
      if (success) {
        setConnected(true);
        await updateConfig(CONFIG_KEYS.GMAIL_CONNECTED, "true");
        showSuccessToast("Gmail connected");
      } else {
        showErrorToast("Could not connect", "Sign in was cancelled or failed");
      }
    } catch (err) {
      showErrorToast("Connection failed", err);
    }
  }

  async function handleSessionExpired() {
    await handleDisconnect();
    showErrorToast("Session expired", "Please reconnect your Gmail");
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        await handleSessionExpired();
        return;
      }
      const res = await fetch(`${GMAIL_API.MESSAGES}?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await handleSessionExpired();
        return;
      }

      const profileRes = await fetch(GMAIL_API.PROFILE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setEmail(profile.emailAddress);
      }

      showSuccessToast("Connection verified");
    } catch {
      await handleSessionExpired();
    } finally {
      setVerifying(false);
    }
  }

  async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    setShowDatePicker(false);
    await gmailSyncConfig.updateSyncFromDate(date);
    setLastSynced(date.toISOString());
  }

  async function handleSync() {
    try {
      const response = await gmailSyncMutation.mutateAsync();
      if (response.result.nobanks) {
        showErrorToast("No active banks", "Add a bank in settings to sync");
        return;
      }

      setLastSynced(
        (await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT)) ?? null,
      );
      setEmailsFetched(response.newFetched);
      setTransactionsAdded(response.newAdded);

      setSyncResult(response.result);
      setShowResults(true);
      showSuccessToast("Sync completed");
    } catch (err) {
      if (err instanceof Error && err.message === "No active banks") {
        showErrorToast("No active banks", "Add a bank in settings to sync");
      } else {
        showErrorToast("Sync failed", err);
      }
    }
  }

  async function handleDisconnect() {
    await signOut();
    await gmailSyncConfig.disconnect();
    setConnected(false);
    setEmail(null);
    setLastSynced(null);
    setEmailsFetched(null);
    setTransactionsAdded(null);
    showSuccessToast("Gmail disconnected");
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Gmail Sync" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={SCROLL_BOTTOM_PADDING}
        >
          <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
            Connect your Gmail so Kharcha can read bank transaction emails and
            turn them into entries automatically. We only read messages sent
            from the bank addresses you've configured — nothing else.
          </Text>

          <SectionHeader
            title="How it works"
            description="Two things are required for Gmail Sync to work."
          />
          <View className="mx-5 mb-2 flex-row gap-3">
            <StepCard
              step="1"
              title="Connect Gmail"
              body="Sign in with the Google account that receives your bank emails. We use read-only access."
            />
            <StepCard
              step="2"
              title="Add your banks"
              body="Tell us which sender addresses belong to your banks (e.g. alerts@hdfcbank.net). Only those are scanned."
            />
          </View>

          <SectionHeader title="Status" />
          <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
            <View
              className={cn(
                "mr-3 h-2.5 w-2.5 rounded-full",
                connected ? "bg-positive" : "bg-negative",
              )}
            />
            <Text className="flex-1 text-sm font-medium text-foreground">
              {connected ? "Connected" : "Not Connected"}
            </Text>
            {email && (
              <Text className="text-sm text-muted-foreground">{email}</Text>
            )}
          </View>

          {!connected && (
            <View className="mx-5 mt-4">
              <Button
                className="h-14 rounded-2xl bg-primary"
                onPress={handleConnect}
                disabled={busy}
              >
                <Text className="text-base font-semibold text-primary-foreground">
                  Connect with Google
                </Text>
              </Button>
            </View>
          )}

          {connected && (
            <>
              <SectionHeader title="Info" />
              <InfoRow
                label="Last Synced"
                value={
                  lastSynced
                    ? `${formatDistanceToNow(new Date(lastSynced))} ago`
                    : "Never"
                }
              />
              <InfoRow label="Emails Fetched" value={emailsFetched ?? "0"} />
              <InfoRow
                label="Transactions Added"
                value={transactionsAdded ?? "0"}
              />

              <SwitchRow
                label="Enable Gmail Sync"
                description="Turn off to pause all Gmail syncing — manual and automatic."
                value={autoRefreshPrefs?.gmail ?? false}
                onValueChange={(next) =>
                  setAutoRefreshPref.mutate({ key: "gmail", enabled: next })
                }
              />

              <SectionHeader title="Banks" />
              <Pressable
                onPress={() => router.push(SCREENS.BANKS)}
                className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
              >
                <Icon as={Landmark} className="mr-3 size-4 text-primary" />
                <Text className="flex-1 text-sm font-medium text-foreground">
                  Manage Banks
                </Text>
                <Text className="mr-2 text-xs text-muted-foreground">
                  {activeBanks.length} active
                </Text>
                <Icon
                  as={ChevronRight}
                  className="size-4 text-muted-foreground"
                />
              </Pressable>
              {noActiveBanks && (
                <View className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3">
                  <Text className="text-sm font-semibold text-foreground">
                    No banks configured
                  </Text>
                  <Pressable
                    onPress={() => router.push(SCREENS.BANKS)}
                    className="mt-1"
                  >
                    <Text className="text-xs text-primary">
                      Go to Settings → Banks to add your bank
                    </Text>
                  </Pressable>
                </View>
              )}

              <SectionHeader title="Sync From" />
              <Pressable
                onPress={() => setShowDatePicker(!showDatePicker)}
                className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
              >
                <Text className="flex-1 text-sm font-medium text-foreground">
                  Fetch emails after
                </Text>
                <Text className="text-sm text-primary">
                  {format(syncFromDate, DATE_DISPLAY_FORMAT)}
                </Text>
              </Pressable>
              <Text className="mx-5 mb-2 text-[11px] text-muted-foreground">
                Can't go earlier than {GMAIL_SYNC_MAX_MONTHS_BACK} month
                {GMAIL_SYNC_MAX_MONTHS_BACK === 1 ? "" : "s"} ago.
              </Text>
              <Suspense fallback={null}>
                <DateTimePickerModal
                  visible={showDatePicker}
                  value={syncFromDate}
                  maximumDate={new Date()}
                  minimumDate={subMonths(
                    new Date(),
                    GMAIL_SYNC_MAX_MONTHS_BACK,
                  )}
                  onConfirm={(date) => {
                    setShowDatePicker(false);
                    handleUpdateSyncFrom(date);
                  }}
                  onCancel={() => setShowDatePicker(false)}
                />
              </Suspense>

              <View className="mx-5 mb-3 mt-6">
                <Button
                  className="h-12 rounded-xl bg-primary"
                  onPress={handleSync}
                  disabled={busy || noActiveBanks || !autoRefreshPrefs?.gmail}
                >
                  {syncing ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.WHITE}
                      className="mr-2"
                    />
                  ) : null}
                  <Text className="text-sm font-semibold text-primary-foreground">
                    {syncing ? "Syncing..." : "Sync Now"}
                  </Text>
                </Button>
              </View>
              <View className="mx-5 flex-row gap-3">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl border-border"
                  onPress={handleVerify}
                  disabled={busy}
                >
                  {verifying ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.PRIMARY}
                      className="mr-2"
                    />
                  ) : null}
                  <Text className="text-sm font-medium text-foreground">
                    {verifying ? "Verifying..." : "Verify"}
                  </Text>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl border-border"
                  onPress={handleDisconnect}
                  disabled={busy}
                >
                  <Text className="text-sm font-medium text-negative">
                    Disconnect
                  </Text>
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      )}
      {syncResult && (
        <Suspense fallback={null}>
          <SyncResultsSheet
            visible={showResults}
            onClose={() => setShowResults(false)}
            subtitle={`${syncResult.added + syncResult.failed + syncResult.skipped} emails processed`}
            emptyMessage="No emails found"
            stats={[]}
            showViewButton={syncResult.added > 0}
          >
            <View className="mb-3">
              <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Transactions
              </Text>
              <StatLine
                label="Added"
                count={syncResult.added}
                icon="✅"
                color={COLORS.POSITIVE}
              />
              <StatLine
                label="Duplicates skipped"
                count={syncResult.skipped}
                icon="⚠️"
                color={COLORS.WARNING}
              />
              <StatLine
                label="Failed"
                count={syncResult.failed}
                icon="❌"
                color={COLORS.DANGER}
              />
            </View>

            {syncResult.emailLogs.length > 0 && (
              <View className="mb-2">
                <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Parsed By
                </Text>
                {syncResult.emailLogs.slice(0, 50).map((log) => (
                  <EmailLogRow
                    key={log.id}
                    log={log}
                    bankName={lookupBankName(log.from)}
                  />
                ))}
                {syncResult.emailLogs.length > 50 && (
                  <Text className="mt-2 text-center text-xs text-muted-foreground">
                    …and {syncResult.emailLogs.length - 50} more
                  </Text>
                )}
              </View>
            )}
          </SyncResultsSheet>
        </Suspense>
      )}
    </View>
  );
}

function StatLine({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: string;
  color: string;
}) {
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl bg-background px-4 py-3">
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <View
        className="rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${color}22` }} // Dynamic opacity suffix — cannot use NativeWind
      >
        <Text className="text-[11px] font-semibold" style={{ color }}>
          {count}
        </Text>
      </View>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}22` }} // Dynamic opacity suffix — cannot use NativeWind
    >
      <Text
        className="text-[9px] font-bold uppercase tracking-wide"
        style={{ color }}
      >
        {text}
      </Text>
    </View>
  );
}

function EmailLogRow({ log, bankName }: { log: EmailLog; bankName: string }) {
  const statusColor: Record<EmailLog["status"], string> = {
    [EMAIL_LOG_STATUS.ADDED]: COLORS.POSITIVE,
    [EMAIL_LOG_STATUS.DUPLICATE]: COLORS.WARNING,
    [EMAIL_LOG_STATUS.FAILED]: COLORS.DANGER,
    [EMAIL_LOG_STATUS.NOT_TRANSACTION]: COLORS.MUTED,
  };
  const parsedLabel = log.parsedBy === "gemini" ? "ai" : log.parsedBy;
  const parsedColor =
    log.parsedBy === "regex"
      ? COLORS.BADGE_BLUE
      : log.parsedBy === "gemini"
        ? COLORS.PRIMARY
        : COLORS.DANGER;
  const confidenceColor: Record<"high" | "medium" | "low", string> = {
    high: COLORS.POSITIVE,
    medium: COLORS.WARNING,
    low: COLORS.DANGER,
  };
  const statusLabel =
    log.status === EMAIL_LOG_STATUS.NOT_TRANSACTION ? "not txn" : log.status;

  return (
    <View className="mb-2 rounded-xl bg-background px-3 py-2.5">
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-xs font-medium text-foreground"
          numberOfLines={1}
        >
          {bankName}
        </Text>
        <Badge text={parsedLabel} color={parsedColor} />
        {log.confidence && (
          <Badge
            text={log.confidence}
            color={confidenceColor[log.confidence]}
          />
        )}
        <Badge text={statusLabel} color={statusColor[log.status]} />
      </View>
      {log.subject ? (
        <Text
          className="mt-1 text-[11px] text-muted-foreground"
          numberOfLines={2}
        >
          {log.subject}
        </Text>
      ) : null}
      {log.transaction && (
        <Text
          className="mt-1 text-[11px] text-muted-foreground"
          numberOfLines={1}
        >
          {log.transaction.merchant ?? "—"} · ₹{log.transaction.amount} ·{" "}
          {log.transaction.date}
        </Text>
      )}
      {log.parsedBy === "gemini" && log.geminiResponse && (
        <Text
          className="mt-1 text-[10px] text-muted-foreground/80"
          numberOfLines={4}
        >
          ai: {log.geminiResponse}
        </Text>
      )}
      {log.reason && (
        <Text className="mt-1 text-[10px] text-negative">{log.reason}</Text>
      )}
      {log.errorMessage && (
        <Text className="mt-1 text-[10px] text-negative" numberOfLines={2}>
          {log.errorMessage}
        </Text>
      )}
      {log.status !== EMAIL_LOG_STATUS.ADDED &&
        log.status !== EMAIL_LOG_STATUS.DUPLICATE &&
        log.body && (
          <View className="mt-2 rounded-lg border border-border bg-card p-2">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Email snippet
              </Text>
              <Pressable
                onPress={() => copyMaskedToClipboard(log.body ?? "", "Snippet")}
                className="flex-row items-center gap-1 rounded-md bg-background px-2 py-1"
              >
                <Icon as={Copy} className="size-3 text-primary" />
                <Text className="text-[10px] font-medium text-primary">
                  Copy
                </Text>
              </Pressable>
            </View>
            <Text className="text-[10px] text-foreground" selectable>
              {log.body}
            </Text>
          </View>
        )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

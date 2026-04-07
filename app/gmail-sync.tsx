import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { router } from "expo-router";
import { ChevronRight, Landmark } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { SyncResultsSheet } from "@/components/sync-results-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useBanksWithEmails } from "@/hooks/use-banks";
import { useSyncState } from "@/hooks/use-sync-state";
import {
  COLORS,
  CONFIG_KEYS,
  DATE_FORMAT,
  GMAIL_API,
  QUERY_KEYS,
  SCREENS,
} from "@/lib/constants";
import { deleteConfig, getConfig, updateConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";
import {
  type EmailLog,
  type SyncResult,
  syncGmailTransactions,
} from "@/lib/gmail/sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function GmailSyncScreen() {
  const queryClient = useQueryClient();
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { data: banksData = [] } = useBanksWithEmails();
  const activeBanks = banksData.filter(
    (b) => b.is_active === 1 && b.emails.length > 0,
  );
  const noActiveBanks = activeBanks.length === 0;
  const busy = loading || syncing || verifying;

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
    await updateConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT, date.toISOString());
    setLastSynced(date.toISOString());
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncGmailTransactions();

      if (result.nobanks) {
        showErrorToast("No active banks", "Add a bank in settings to sync");
        return;
      }

      const newFetched = String(
        Number(emailsFetched ?? "0") +
          result.added +
          result.skipped +
          result.failed,
      );
      const newAdded = String(Number(transactionsAdded ?? "0") + result.added);

      await Promise.all([
        updateConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED, newFetched),
        updateConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED, newAdded),
      ]);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] }),
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

      const synced = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
      setLastSynced(synced);
      setEmailsFetched(newFetched);
      setTransactionsAdded(newAdded);

      setSyncResult(result);
      setShowResults(true);
    } catch (err) {
      showErrorToast("Sync failed", err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    await signOut();
    await Promise.all([
      deleteConfig(CONFIG_KEYS.GMAIL_CONNECTED),
      deleteConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT),
      deleteConfig(CONFIG_KEYS.GMAIL_EMAILS_FETCHED),
      deleteConfig(CONFIG_KEYS.GMAIL_TRANSACTIONS_ADDED),
    ]);
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
          contentContainerStyle={{ paddingBottom: 40 }}
        >
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
                  {format(syncFromDate, DATE_FORMAT)}
                </Text>
              </Pressable>
              {showDatePicker && (
                <View className="mx-5 mb-2 rounded-xl border border-border bg-card">
                  <DateTimePicker
                    value={syncFromDate}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    themeVariant="dark"
                    onChange={(_event, date) => {
                      if (date) handleUpdateSyncFrom(date);
                    }}
                    style={{ height: 150 }}
                  />
                </View>
              )}

              <View className="mx-5 mb-3 mt-6">
                <Button
                  className="h-12 rounded-xl bg-primary"
                  onPress={handleSync}
                  disabled={busy || noActiveBanks}
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
        style={{ backgroundColor: `${color}22` }}
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
      style={{ backgroundColor: `${color}22` }}
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
    added: COLORS.POSITIVE,
    duplicate: COLORS.WARNING,
    failed: COLORS.DANGER,
    not_transaction: COLORS.MUTED,
  };
  const parsedColor =
    log.parsedBy === "regex"
      ? COLORS.BADGE_BLUE
      : log.parsedBy === "gemini"
        ? COLORS.PRIMARY
        : COLORS.DANGER;
  const statusLabel = log.status === "not_transaction" ? "not txn" : log.status;

  return (
    <View className="mb-2 rounded-xl bg-background px-3 py-2.5">
      <View className="flex-row items-center gap-2">
        <Text
          className="flex-1 text-xs font-medium text-foreground"
          numberOfLines={1}
        >
          {bankName}
        </Text>
        <Badge text={log.parsedBy} color={parsedColor} />
        <Badge text={statusLabel} color={statusColor[log.status]} />
      </View>
      {log.subject ? (
        <Text
          className="mt-1 text-[11px] text-muted-foreground"
          numberOfLines={1}
        >
          {log.subject}
        </Text>
      ) : null}
      {log.transaction && (
        <Text className="mt-1 text-[11px] text-muted-foreground">
          {log.transaction.merchant ?? "—"} · ₹{log.transaction.amount} ·{" "}
          {log.transaction.date}
        </Text>
      )}
      {log.parsedBy === "gemini" && log.geminiResponse && (
        <Text
          className="mt-1 text-[10px] text-muted-foreground/80"
          numberOfLines={2}
        >
          gemini: {log.geminiResponse}
        </Text>
      )}
      {log.reason && (
        <Text className="mt-1 text-[10px] text-negative">{log.reason}</Text>
      )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { router } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
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
import { type SyncResult, syncGmailTransactions } from "@/lib/gmail/sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

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
  const busy = loading || syncing || verifying;

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

  async function handleVerify() {
    setVerifying(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        await handleDisconnect();
        showErrorToast("Session expired", "Please reconnect your Gmail");
        return;
      }
      const res = await fetch(`${GMAIL_API.MESSAGES}?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await handleDisconnect();
        showErrorToast("Session expired", "Please reconnect your Gmail");
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
      await handleDisconnect();
      showErrorToast("Session expired", "Please reconnect your Gmail");
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
                  disabled={busy}
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
                  className="h-12 flex-1 rounded-xl border-[#2a2a2a]"
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
                  className="h-12 flex-1 rounded-xl border-[#2a2a2a]"
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
      <GmailSyncResultsSheet
        result={syncResult}
        visible={showResults}
        onClose={() => setShowResults(false)}
      />
    </View>
  );
}

function AccordionSection({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between rounded-xl bg-background px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <Text className="text-sm font-semibold text-foreground">{title}</Text>
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="text-[10px] font-medium text-muted-foreground">
              {count}
            </Text>
          </View>
        </View>
        <Icon
          as={expanded ? ChevronUp : ChevronDown}
          className="size-4 text-muted-foreground"
        />
      </Pressable>
      {expanded && <View className="mt-1 px-2">{children}</View>}
    </View>
  );
}

function EmailRow({ sender, text }: { sender: string; text: string }) {
  const shortSender = sender.split("@")[0] ?? sender;
  return (
    <View className="border-b border-border/50 py-2.5">
      <Text className="text-xs font-medium text-primary">{shortSender}</Text>
      <Text className="mt-0.5 text-sm text-muted-foreground">{text}</Text>
    </View>
  );
}

function GmailSyncResultsSheet({
  result,
  visible,
  onClose,
}: {
  result: SyncResult | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!result) return null;

  const totalProcessed =
    result.added + result.failed + result.filtered + result.skipped;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="rounded-t-2xl bg-card px-5 pb-6 pt-5">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-base font-bold text-foreground">
            Sync Results
          </Text>
          <Text className="text-xs text-muted-foreground">
            {totalProcessed} emails processed
          </Text>
        </View>

        {totalProcessed === 0 && (
          <Text className="py-8 text-center text-sm text-muted-foreground">
            No emails found
          </Text>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 400 }}
        >
          <AccordionSection
            title="Added"
            count={result.added}
            color={COLORS.POSITIVE}
          >
            {result.addedEmails.map((e) => (
              <EmailRow key={`a-${e.id}`} sender={e.sender} text={e.text} />
            ))}
          </AccordionSection>

          <AccordionSection
            title="Failed to parse"
            count={result.failed}
            color={COLORS.DANGER}
          >
            {result.failedEmails.map((e) => (
              <EmailRow key={`f-${e.id}`} sender={e.sender} text={e.text} />
            ))}
          </AccordionSection>

          <AccordionSection
            title="Filtered"
            count={result.filtered}
            color={COLORS.MUTED}
          >
            {result.filteredEmails.map((e) => (
              <EmailRow key={`x-${e.id}`} sender={e.sender} text={e.text} />
            ))}
          </AccordionSection>

          {result.skipped > 0 && (
            <View className="flex-row items-center gap-2 rounded-xl bg-background px-4 py-3">
              <View className="h-2 w-2 rounded-full bg-muted-foreground" />
              <Text className="text-sm text-muted-foreground">
                {result.skipped} duplicates skipped
              </Text>
            </View>
          )}
        </ScrollView>

        <View className={cn("mt-4 flex-row gap-3", isIOS && "mb-4")}>
          {result.added > 0 && (
            <Pressable
              onPress={() => {
                onClose();
                router.push(`${SCREENS.HISTORY}?source_type=synced`);
              }}
              className="flex-1 items-center rounded-xl border border-border py-3"
            >
              <Text className="text-sm font-semibold text-foreground">
                View
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onClose}
            className="flex-1 items-center rounded-xl bg-primary py-3"
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export const ErrorBoundary = ScreenError;

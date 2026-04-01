import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { QUERY_KEYS, SCREENS, TOAST_TYPE } from "@/lib/constants";
import { deleteConfig, getConfig, updateConfig } from "@/lib/db/config";
import { useGoogleAuth } from "@/lib/gmail/auth";
import { syncGmailTransactions } from "@/lib/gmail/sync";
import { cn, isIOS } from "@/lib/utils";

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </Text>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <Text className="text-sm text-muted-foreground">{value}</Text>
    </View>
  );
}

export default function GmailSyncScreen() {
  const { format: fmt } = useCurrency();
  const queryClient = useQueryClient();
  const { signIn, signOut, isConnected, getValidAccessToken } = useGoogleAuth();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [emailsFetched, setEmailsFetched] = useState<string | null>(null);
  const [transactionsAdded, setTransactionsAdded] = useState<string | null>(
    null,
  );
  const [syncing, setSyncing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: isConnected is stable from hook
  const loadState = useCallback(async () => {
    const [isConn, synced, fetched, added] = await Promise.all([
      isConnected(),
      getConfig("gmail_last_synced_at"),
      getConfig("gmail_emails_fetched"),
      getConfig("gmail_transactions_added"),
    ]);
    setConnected(isConn);
    setLastSynced(synced);
    setEmailsFetched(fetched);
    setTransactionsAdded(added);
    if (synced) {
      setSyncFromDate(new Date(synced));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  async function handleConnect() {
    try {
      const success = await signIn();
      if (success) {
        setConnected(true);
        await updateConfig("gmail_connected", "true");
        Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Gmail connected" });
      } else {
        Toast.show({
          type: TOAST_TYPE.ERROR,
          text1: "Could not connect",
          text2: "Sign in was cancelled or failed",
        });
      }
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Connection failed",
        text2: String(err),
      });
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        Toast.show({
          type: TOAST_TYPE.ERROR,
          text1: "Connection failed",
          text2: "No valid access token — try reconnecting",
        });
        return;
      }
      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json();
        Toast.show({
          type: TOAST_TYPE.ERROR,
          text1: "Connection failed",
          text2: err.error?.message ?? "Try reconnecting",
        });
        return;
      }

      const profileRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setEmail(profile.emailAddress);
      }

      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Connection verified" });
    } catch {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Connection failed",
        text2: "Try reconnecting",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    setShowDatePicker(false);
    await updateConfig("gmail_last_synced_at", date.toISOString());
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
        updateConfig("gmail_emails_fetched", newFetched),
        updateConfig("gmail_transactions_added", newAdded),
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

      const synced = await getConfig("gmail_last_synced_at");
      setLastSynced(synced);
      setEmailsFetched(newFetched);
      setTransactionsAdded(newAdded);

      const lines: string[] = [];
      if (result.expenseCount > 0) {
        lines.push(
          `${result.expenseCount} expense (${fmt(result.expenseTotal)})`,
        );
      }
      if (result.incomeCount > 0) {
        lines.push(`${result.incomeCount} income (${fmt(result.incomeTotal)})`);
      }
      if (result.skipped > 0) {
        lines.push(`${result.skipped} duplicates skipped`);
      }
      if (result.failed > 0) {
        lines.push(`${result.failed} failed to parse`);
      }

      Alert.alert(
        `${result.added} transaction${result.added !== 1 ? "s" : ""} synced`,
        lines.join("\n") || "No new transactions found",
        [
          { text: "OK" },
          ...(result.added > 0
            ? [
                {
                  text: "View",
                  onPress: () =>
                    router.push(`${SCREENS.HISTORY}?source_type=synced`),
                },
              ]
            : []),
        ],
      );
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Sync failed",
        text2: String(err),
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    await signOut();
    await Promise.all([
      deleteConfig("gmail_connected"),
      deleteConfig("gmail_last_synced_at"),
      deleteConfig("gmail_emails_fetched"),
      deleteConfig("gmail_transactions_added"),
    ]);
    setConnected(false);
    setEmail(null);
    setLastSynced(null);
    setEmailsFetched(null);
    setTransactionsAdded(null);
    Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Gmail disconnected" });
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">Gmail Sync</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7c3aed" />
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
                  {format(syncFromDate, "dd MMM yyyy")}
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

              <SectionHeader title="Actions" />
              <View className="mx-5 mb-2">
                <Button
                  variant="outline"
                  className="h-12 rounded-xl border-[#2a2a2a]"
                  onPress={handleVerify}
                  disabled={verifying}
                >
                  {verifying ? (
                    <ActivityIndicator
                      size="small"
                      color="#7c3aed"
                      className="mr-2"
                    />
                  ) : null}
                  <Text className="text-sm font-medium text-foreground">
                    {verifying ? "Verifying..." : "Verify Connection"}
                  </Text>
                </Button>
              </View>
              <View className="mx-5 mb-2">
                <Button
                  className="h-14 rounded-2xl bg-primary"
                  onPress={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <ActivityIndicator
                      size="small"
                      color="#ffffff"
                      className="mr-2"
                    />
                  ) : null}
                  <Text className="text-base font-semibold text-primary-foreground">
                    {syncing ? "Syncing..." : "Sync Now"}
                  </Text>
                </Button>
              </View>
              <Pressable
                onPress={handleDisconnect}
                className="mx-5 mt-2 items-center py-3"
              >
                <Text className="text-sm font-medium text-negative">
                  Disconnect
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

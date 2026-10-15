import { formatDistanceToNow, subMonths } from "date-fns";
import { router } from "expo-router";
import { ChevronRight, Copy, Landmark } from "lucide-react-native";
import { lazy, Suspense } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { DateTimePickerRow } from "@/components/ui/date-time-picker-row";
import { Icon } from "@/components/ui/icon";
import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StepCard } from "@/components/ui/step-card";
import { SwitchRow } from "@/components/ui/switch-row";
import { Text } from "@/components/ui/text";
import { useGmailSyncUi } from "@/hooks/use-gmail-sync-ui";
import { copyMaskedToClipboard, maskSensitivePii } from "@/lib/clipboard";
import {
  COLORS,
  EMAIL_LOG_STATUS,
  GMAIL_SYNC_MAX_MONTHS_BACK,
  SCREENS,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import type { EmailLog } from "@/lib/gmail/sync";
import { cn } from "@/lib/utils";

const SyncResultsSheet = lazy(() =>
  import("@/components/sync-results-sheet").then((m) => ({
    default: m.SyncResultsSheet,
  })),
);

type BadgeTone =
  | "positive"
  | "warning"
  | "negative"
  | "info"
  | "muted"
  | "primary";

// Tone → static NativeWind classes. Values must be literal strings (not
// runtime template interpolation) so the Tailwind/NativeWind build step can
// see them — see CLAUDE.md: "nativewind classes only, no inline style prop".
// The bg-*/15 opacity mirrors the old `${color}22` hex-alpha hack. `info`
// mirrors COLORS.BADGE_BLUE (lib/constants.ts) — no matching Tailwind token
// exists yet, so it's inlined as an arbitrary value instead of adding one
// for a single caller.
const BADGE_TONE_CLASSES = {
  positive: { bg: "bg-positive/15", text: "text-positive" },
  warning: { bg: "bg-warning/15", text: "text-warning" },
  negative: { bg: "bg-negative/15", text: "text-negative-text" },
  info: { bg: "bg-[#1d4ed826]", text: "text-[#1d4ed8]" },
  muted: { bg: "bg-muted-foreground/15", text: "text-muted-foreground" },
  primary: { bg: "bg-primary/15", text: "text-primary-text" },
} satisfies Record<BadgeTone, { bg: string; text: string }>;

export default function GmailSyncScreen() {
  const {
    connected,
    email,
    loading,
    syncing,
    verifying,
    busy,
    syncFromDate,
    lastSynced,
    activeBanks,
    noActiveBanks,
    autoRefreshEnabled,
    toggleAutoRefresh,
    syncResult,
    showResults,
    closeResults,
    lookupBankName,
    handleConnect,
    handleVerify,
    handleSync,
    handleDisconnect,
    handleUpdateSyncFrom,
  } = useGmailSyncUi();

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
              <SectionHeader title="Sync From" />
              <DateTimePickerRow
                label="Fetch emails after"
                value={syncFromDate}
                dateTitle="Fetch Emails After"
                maximumDate={new Date()}
                minimumDate={subMonths(new Date(), GMAIL_SYNC_MAX_MONTHS_BACK)}
                onChange={handleUpdateSyncFrom}
              />
              <Text className="mx-5 mb-2 text-[11px] text-muted-foreground">
                Can't go earlier than {GMAIL_SYNC_MAX_MONTHS_BACK} month
                {GMAIL_SYNC_MAX_MONTHS_BACK === 1 ? "" : "s"} ago.
              </Text>

              <View className="mx-5 mb-3 mt-2">
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

              <SectionHeader title="Info" />
              <InfoRow
                label="Last Synced"
                value={
                  lastSynced
                    ? `${formatDistanceToNow(new Date(lastSynced))} ago`
                    : "Never"
                }
              />
              <SwitchRow
                label="Auto-sync on refresh"
                description="When off, pulling to refresh on Home or History won't check Gmail. Sync Now above always works."
                value={autoRefreshEnabled}
                onValueChange={toggleAutoRefresh}
              />

              <SectionHeader title="Banks" />
              <Pressable
                onPress={() => router.push(SCREENS.BANKS)}
                accessibilityRole="button"
                className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
              >
                <Icon as={Landmark} className="mr-3 size-4 text-primary-text" />
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
                    accessibilityRole="button"
                    className="mt-1"
                  >
                    <Text className="text-xs text-primary-text">
                      Go to Settings → Banks to add your bank
                    </Text>
                  </Pressable>
                </View>
              )}

              <View className="mx-5 mt-6 flex-row gap-3">
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
                  <Text className="text-sm font-medium text-negative-text">
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
            onClose={closeResults}
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
                tone="positive"
              />
              <StatLine
                label="Duplicates skipped"
                count={syncResult.skipped}
                icon="⚠️"
                tone="warning"
              />
              <StatLine
                label="Failed"
                count={syncResult.failed}
                icon="❌"
                tone="negative"
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
  tone,
}: {
  label: string;
  count: number;
  icon: string;
  tone: BadgeTone;
}) {
  const { bg, text } = BADGE_TONE_CLASSES[tone];
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl bg-background px-4 py-3">
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <View className={cn("rounded-full px-2 py-0.5", bg)}>
        <Text className={cn("text-[11px] font-semibold", text)}>{count}</Text>
      </View>
    </View>
  );
}

function Badge({ text, tone }: { text: string; tone: BadgeTone }) {
  const { bg, text: textClass } = BADGE_TONE_CLASSES[tone];
  return (
    <View className={cn("rounded-full px-2 py-0.5", bg)}>
      <Text
        className={cn(
          "text-[10px] font-bold uppercase tracking-wide",
          textClass,
        )}
      >
        {text}
      </Text>
    </View>
  );
}

function EmailLogRow({ log, bankName }: { log: EmailLog; bankName: string }) {
  const statusColor = {
    [EMAIL_LOG_STATUS.ADDED]: "positive",
    [EMAIL_LOG_STATUS.DUPLICATE]: "warning",
    [EMAIL_LOG_STATUS.FAILED]: "negative",
    [EMAIL_LOG_STATUS.NOT_TRANSACTION]: "muted",
  } satisfies Record<EmailLog["status"], BadgeTone>;
  const parsedLabel = log.parsedBy === "gemini" ? "ai" : log.parsedBy;
  const parsedColor: BadgeTone =
    log.parsedBy === "regex"
      ? "info"
      : log.parsedBy === "gemini"
        ? "primary"
        : "negative";
  const confidenceColor = {
    high: "positive",
    medium: "warning",
    low: "negative",
  } satisfies Record<"high" | "medium" | "low", BadgeTone>;
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
        <Badge text={parsedLabel} tone={parsedColor} />
        {log.confidence && (
          <Badge text={log.confidence} tone={confidenceColor[log.confidence]} />
        )}
        <Badge text={statusLabel} tone={statusColor[log.status]} />
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
        <Text className="mt-1 text-[10px] text-negative-text">
          {log.reason}
        </Text>
      )}
      {log.errorMessage && (
        <Text className="mt-1 text-[10px] text-negative-text" numberOfLines={2}>
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
                accessibilityRole="button"
                className="flex-row items-center gap-1 rounded-md bg-background px-2 py-1"
              >
                <Icon as={Copy} className="size-3 text-primary-text" />
                <Text className="text-[10px] font-medium text-primary-text">
                  Copy
                </Text>
              </Pressable>
            </View>
            <Text className="text-[10px] text-foreground" selectable>
              {maskSensitivePii(log.body)}
            </Text>
          </View>
        )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

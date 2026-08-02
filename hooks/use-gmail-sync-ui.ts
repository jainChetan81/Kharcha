import { useState } from "react";
import {
  useAutoRefreshPrefs,
  useSetAutoRefreshPref,
} from "@/hooks/use-auto-refresh-prefs";
import { useBanksWithEmails } from "@/hooks/use-banks";
import { useGmailSync, useGmailSyncConfig } from "@/hooks/use-gmail-sync";
import { useSyncState } from "@/hooks/use-sync-state";
import { CONFIG_KEYS, GMAIL_API } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { useGoogleAuth } from "@/lib/gmail/auth";
import type { SyncResult } from "@/lib/gmail/sync";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const GMAIL_VERIFY_TIMEOUT_MS = 15_000;

type BankWithEmails = ReturnType<typeof useBanksWithEmails>["data"] extends
  | infer T
  | undefined
  ? T extends readonly (infer U)[]
    ? U
    : never
  : never;

export type UseGmailSyncUiReturn = {
  connected: boolean;
  email: string | null;
  loading: boolean;
  syncing: boolean;
  verifying: boolean;
  busy: boolean;
  syncFromDate: Date;
  lastSynced: string | null;
  activeBanks: BankWithEmails[];
  noActiveBanks: boolean;
  autoRefreshEnabled: boolean;
  toggleAutoRefresh: (enabled: boolean) => void;
  syncResult: SyncResult | null;
  showResults: boolean;
  closeResults: () => void;
  lookupBankName: (from: string) => string;
  handleConnect: () => Promise<void>;
  handleVerify: () => Promise<void>;
  handleSync: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleUpdateSyncFrom: (date: Date) => Promise<void>;
};

export function useGmailSyncUi(): UseGmailSyncUiReturn {
  const { signIn, signOut, getValidAccessToken } = useGoogleAuth();
  const {
    connected,
    setConnected,
    lastSynced,
    setLastSynced,
    loading,
    syncFromDate,
    setSyncFromDate,
  } = useSyncState();

  const [email, setEmail] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [verifying, setVerifying] = useState(false);

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
    for (const e of b.emails) {
      emailToBankName.set(e.email.toLowerCase(), b.name);
    }
  }

  function lookupBankName(from: string): string {
    return (
      emailToBankName.get(from.toLowerCase()) ?? from.split("@")[0] ?? from
    );
  }

  async function handleDisconnect() {
    await signOut();
    await gmailSyncConfig.disconnect();
    setConnected(false);
    setEmail(null);
    setLastSynced(null);
    logEvent(FIREBASE_EVENTS.GMAIL_DISCONNECTED);
    showSuccessToast("Gmail disconnected");
  }

  async function handleSessionExpired() {
    logEvent(FIREBASE_EVENTS.GMAIL_SESSION_EXPIRED);
    await handleDisconnect();
    showErrorToast("Session expired", "Please reconnect your Gmail");
  }

  async function handleConnect() {
    try {
      const success = await signIn();
      if (success) {
        setConnected(true);
        await updateConfig(CONFIG_KEYS.GMAIL_CONNECTED, "true");
        logEvent(FIREBASE_EVENTS.GMAIL_CONNECTED);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GMAIL_VERIFY_TIMEOUT_MS,
    );
    try {
      const token = await getValidAccessToken();
      if (!token) {
        await handleSessionExpired();
        return;
      }
      const res = await fetch(`${GMAIL_API.MESSAGES}?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      // Only 401/403 actually means the token is invalid. Anything else
      // (5xx, 429, or any other non-ok status) is not proof the session
      // expired — don't force a disconnect over it.
      if (res.status === 401 || res.status === 403) {
        await handleSessionExpired();
        return;
      }
      if (!res.ok) {
        showErrorToast(
          "Verification failed",
          `Gmail returned ${res.status}. Try again.`,
        );
        return;
      }

      const profileRes = await fetch(GMAIL_API.PROFILE, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      // Same auth-failure check as the messages request above — the two
      // calls share the same token, so a 401/403 here is just as much
      // proof of an expired session, and shouldn't be silently swallowed
      // into a false "Connection verified".
      if (profileRes.status === 401 || profileRes.status === 403) {
        await handleSessionExpired();
        return;
      }
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setEmail(profile.emailAddress);
      }

      logEvent(FIREBASE_EVENTS.GMAIL_VERIFIED);
      showSuccessToast("Connection verified");
    } catch (err) {
      // Network failure, timeout/abort, or a JSON parse error land here.
      // None of these prove the Gmail session expired — surface them as an
      // ordinary failure instead of disconnecting the user.
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError")
      ) {
        showErrorToast(
          "Verification timed out",
          "Check your connection and try again",
        );
      } else {
        showErrorToast("Verification failed", err);
      }
    } finally {
      clearTimeout(timeoutId);
      setVerifying(false);
    }
  }

  async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    // CONFIG_KEYS.GMAIL_LAST_SYNCED_AT doubles as "next sync's cursor" (read
    // by lib/gmail/sync.ts) and "last synced" display value. Writing the
    // user's picked date here correctly moves the cursor, but must NOT touch
    // `lastSynced` — picking a date doesn't mean a sync happened.
    await gmailSyncConfig.updateSyncFromDate(date);
  }

  async function handleSync() {
    try {
      const response = await gmailSyncMutation.mutateAsync();

      // Every successful sync writes CONFIG_KEYS.GMAIL_LAST_SYNCED_AT to
      // "now" (lib/gmail/sync.ts) — that's both the "last synced" display
      // value and the cursor the next sync will read. Refresh both local
      // pieces of state from it so "Fetch emails after" doesn't go stale.
      const syncedAt = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
      setLastSynced(syncedAt ?? null);
      if (syncedAt) setSyncFromDate(new Date(syncedAt));

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

  function toggleAutoRefresh(enabled: boolean) {
    setAutoRefreshPref.mutate(enabled);
  }

  return {
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
    autoRefreshEnabled: autoRefreshPrefs?.gmail ?? true,
    toggleAutoRefresh,
    syncResult,
    showResults,
    closeResults: () => setShowResults(false),
    lookupBankName,
    handleConnect,
    handleVerify,
    handleSync,
    handleDisconnect,
    handleUpdateSyncFrom,
  };
}

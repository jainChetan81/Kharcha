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

      logEvent(FIREBASE_EVENTS.GMAIL_VERIFIED);
      showSuccessToast("Connection verified");
    } catch {
      await handleSessionExpired();
    } finally {
      setVerifying(false);
    }
  }

  async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
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
    autoRefreshEnabled: autoRefreshPrefs?.gmail ?? false,
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

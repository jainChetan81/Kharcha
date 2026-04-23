import { formatDistanceToNow } from "date-fns";
import { Alert } from "react-native";
import {
  useBackupNow,
  useCloudBackupSettings,
  useLatestBackup,
  useRestoreFromCloud,
} from "@/hooks/use-cloud-backup";
import { DriveScopeMissingError, ICloudSyncingError } from "@/lib/cloud-backup";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export type UseCloudBackupUiReturn = {
  supported: boolean;
  enabled: boolean;
  providerLabel: string;
  lastLabel: string;
  backupPending: boolean;
  restorePending: boolean;
  busy: boolean;
  handleToggle: (next: boolean) => Promise<void>;
  handleBackupNow: () => Promise<void>;
  handleRestore: () => void;
};

export function useCloudBackupUi(): UseCloudBackupUiReturn {
  const { enabled, hasEverBackedUp, setEnabled, provider } =
    useCloudBackupSettings();
  const { data: latest } = useLatestBackup({
    enabled: enabled || hasEverBackedUp,
  });
  const backupMutation = useBackupNow();
  const restoreMutation = useRestoreFromCloud();

  const supported = provider !== "unsupported";
  const providerLabel = provider === "icloud" ? "iCloud" : "Google Drive";
  const lastLabel = latest
    ? `Last backed up ${formatDistanceToNow(new Date(latest.modifiedTime), { addSuffix: true })}`
    : "No backup yet";

  function reportBackupError(err: unknown, fallbackTitle: string) {
    if (err instanceof DriveScopeMissingError) {
      showErrorToast(
        "Reconnect Google",
        "Drive permission missing — sign in again in Gmail Sync.",
      );
      return;
    }
    showErrorToast(fallbackTitle, err);
  }

  async function handleToggle(next: boolean) {
    try {
      await setEnabled(next);
      logEvent(FIREBASE_EVENTS.CLOUD_BACKUP_TOGGLED, {
        provider,
        enabled: String(next),
      });
      if (next && !latest) {
        try {
          await backupMutation.mutateAsync();
          logEvent(FIREBASE_EVENTS.CLOUD_BACKUP_TRIGGERED, {
            provider,
            trigger: "first_backup",
          });
          showSuccessToast(`Backed up to ${providerLabel}`);
        } catch (err) {
          reportBackupError(err, "First backup failed");
        }
      }
    } catch (err) {
      showErrorToast("Couldn't update setting", err);
    }
  }

  async function handleBackupNow() {
    try {
      await backupMutation.mutateAsync();
      logEvent(FIREBASE_EVENTS.CLOUD_BACKUP_TRIGGERED, {
        provider,
        trigger: "manual",
      });
      showSuccessToast(`Backed up to ${providerLabel}`);
    } catch (err) {
      reportBackupError(err, "Backup failed");
    }
  }

  function handleRestore() {
    if (!latest && !hasEverBackedUp) {
      showErrorToast(
        "No backup found",
        `Nothing to restore from ${providerLabel} yet.`,
      );
      return;
    }
    Alert.alert(
      `Restore from ${providerLabel}`,
      "This will replace all current data with the cloud backup. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            try {
              await restoreMutation.mutateAsync();
              logEvent(FIREBASE_EVENTS.CLOUD_BACKUP_RESTORED, { provider });
              showSuccessToast("Restored");
            } catch (err) {
              if (err instanceof ICloudSyncingError) {
                showErrorToast(
                  "iCloud still syncing",
                  "Your backup is downloading — try again in a minute.",
                );
                return;
              }
              reportBackupError(err, "Restore failed");
            }
          },
        },
      ],
    );
  }

  const busy = backupMutation.isPending || restoreMutation.isPending;

  return {
    supported,
    enabled,
    providerLabel,
    lastLabel,
    backupPending: backupMutation.isPending,
    restorePending: restoreMutation.isPending,
    busy,
    handleToggle,
    handleBackupNow,
    handleRestore,
  };
}

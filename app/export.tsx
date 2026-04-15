import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  FileText,
  type LucideIcon,
  Upload,
} from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import {
  useBackupNow,
  useCloudBackupSettings,
  useLatestBackup,
  useRestoreFromCloud,
} from "@/hooks/use-cloud-backup";
import { DriveScopeMissingError, ICloudSyncingError } from "@/lib/cloud-backup";
import { COLORS } from "@/lib/constants";
import { initDB } from "@/lib/db";
import { exportDatabase, importDatabase } from "@/lib/db/backup";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const ExportSheet = lazy(() =>
  import("@/components/export-sheet").then((m) => ({
    default: m.ExportSheet,
  })),
);

type Busy = "db-export" | "db-import" | null;

export default function ExportScreen() {
  const queryClient = useQueryClient();
  const [showExport, setShowExport] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  async function handleDbExport() {
    setBusy("db-export");
    try {
      await exportDatabase();
      showSuccessToast("Database exported");
    } catch (err) {
      showErrorToast("Export failed", err);
    } finally {
      setBusy(null);
    }
  }

  function handleDbImport() {
    Alert.alert(
      "Import Database",
      "This will replace all current data with the selected backup. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          style: "destructive",
          onPress: async () => {
            setBusy("db-import");
            try {
              const result = await importDatabase();
              if (!result.imported) return;
              // Bring the imported DB up to the current schema before any
              // query runs against it — otherwise a backup from an older
              // app version would crash queries that expect new columns.
              await initDB();
              await queryClient.invalidateQueries();
              showSuccessToast("Database imported");
            } catch (err) {
              showErrorToast("Import failed", err);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Export & Backup" />

      <SectionHeader title="Export" />
      <Row
        icon={FileText}
        label="Export as CSV"
        disabled={busy !== null}
        onPress={() => setShowExport(true)}
      />

      <SectionHeader title="Backup" />
      <Row
        icon={Download}
        label="Export Database"
        loading={busy === "db-export"}
        disabled={busy !== null}
        onPress={handleDbExport}
      />
      <Row
        icon={Upload}
        label="Import Database"
        loading={busy === "db-import"}
        disabled={busy !== null}
        onPress={handleDbImport}
      />

      <CloudBackupSection />

      <Suspense fallback={null}>
        <ExportSheet
          visible={showExport}
          onClose={() => setShowExport(false)}
        />
      </Suspense>
    </View>
  );
}

function CloudBackupSection() {
  const { enabled, hasEverBackedUp, setEnabled, provider } =
    useCloudBackupSettings();
  const { data: latest } = useLatestBackup({
    enabled: enabled || hasEverBackedUp,
  });
  const backupMutation = useBackupNow();
  const restoreMutation = useRestoreFromCloud();

  if (provider === "unsupported") return null;

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
      if (next && !latest) {
        try {
          await backupMutation.mutateAsync();
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

  return (
    <>
      <SectionHeader title={`${providerLabel} Backup`} />

      <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
        <Icon as={Cloud} className="mr-3 size-4 text-muted-foreground" />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">
            Auto backup daily
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {lastLabel}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
          thumbColor={COLORS.WHITE}
        />
      </View>

      <Row
        icon={CloudUpload}
        label="Back up now"
        loading={backupMutation.isPending}
        disabled={busy}
        onPress={handleBackupNow}
      />
      <Row
        icon={CloudDownload}
        label={`Restore from ${providerLabel}`}
        loading={restoreMutation.isPending}
        disabled={busy}
        onPress={handleRestore}
      />
    </>
  );
}

function Row({
  icon,
  label,
  loading = false,
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
    >
      <Icon as={icon} className="mr-3 size-4 text-muted-foreground" />
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      {loading && <ActivityIndicator size="small" color={COLORS.PRIMARY} />}
    </Pressable>
  );
}

export const ErrorBoundary = ScreenError;

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
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useCommitImport, useExportDatabase } from "@/hooks/use-cloud-backup";
import { useCloudBackupUi } from "@/hooks/use-cloud-backup-ui";
import { COLORS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { type PickedBackup, pickBackupFile } from "@/lib/db/backup";
import { type BackupStats, inspectBackupBytes } from "@/lib/db/inspect";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const ExportSheet = lazy(() =>
  import("@/components/export-sheet").then((m) => ({
    default: m.ExportSheet,
  })),
);

const ImportPreviewSheet = lazy(() =>
  import("@/components/import-preview-sheet").then((m) => ({
    default: m.ImportPreviewSheet,
  })),
);

export default function ExportScreen() {
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [picked, setPicked] = useState<PickedBackup | null>(null);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const exportMutation = useExportDatabase();
  const commitMutation = useCommitImport();

  async function handleDbExport() {
    try {
      await exportMutation.mutateAsync();
      showSuccessToast("Database exported");
    } catch (err) {
      showErrorToast("Export failed", err);
    }
  }

  async function handleDbImport() {
    let pickedFile: PickedBackup | null;
    try {
      pickedFile = await pickBackupFile();
    } catch (err) {
      showErrorToast("Couldn't read file", err);
      return;
    }
    if (!pickedFile) return; // user cancelled the picker

    setPicked(pickedFile);
    setStats(null);
    setImportError(null);
    setShowImport(true);
    setImportLoading(true);

    const result = await inspectBackupBytes(pickedFile.bytes);
    setImportLoading(false);
    if (result.ok) {
      setStats(result.stats);
    } else {
      setImportError(result.reason);
    }
  }

  async function handleConfirmImport() {
    if (!picked) return;
    try {
      await commitMutation.mutateAsync(picked);
      closeImportSheet();
      showSuccessToast("Database imported");
    } catch (err) {
      showErrorToast("Import failed", err);
    }
  }

  function closeImportSheet() {
    setShowImport(false);
    setPicked(null);
    setStats(null);
    setImportError(null);
    setImportLoading(false);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Export & Backup" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Send your data out of the app for spreadsheets, archives, or moving to
          a new phone. CSV is for humans, database files are for a full restore.
        </Text>

        <SectionHeader
          title="Export"
          description="Spreadsheet-friendly format for analysis or sharing."
        />
        <Row
          icon={FileText}
          label="Export as CSV"
          description="One row per transaction. Opens in Excel, Numbers, Google Sheets."
          disabled={exportMutation.isPending || commitMutation.isPending}
          onPress={() => setShowExport(true)}
        />

        <SectionHeader
          title="Backup"
          description="Full snapshot of every transaction, category, and setting."
        />
        <Row
          icon={Download}
          label="Export Database"
          description="Save a complete backup file you can re-import later."
          loading={exportMutation.isPending}
          disabled={exportMutation.isPending || commitMutation.isPending}
          onPress={handleDbExport}
        />
        <Row
          icon={Upload}
          label="Import Database"
          description="Replace all current data with a backup file. Destructive."
          loading={commitMutation.isPending || importLoading}
          disabled={
            exportMutation.isPending ||
            commitMutation.isPending ||
            importLoading
          }
          onPress={handleDbImport}
        />

        <CloudBackupSection />
      </ScrollView>

      <Suspense fallback={null}>
        <ExportSheet
          visible={showExport}
          onClose={() => setShowExport(false)}
        />
        <ImportPreviewSheet
          visible={showImport}
          loading={importLoading}
          importing={commitMutation.isPending}
          stats={stats}
          error={importError}
          onClose={closeImportSheet}
          onConfirm={handleConfirmImport}
        />
      </Suspense>
    </View>
  );
}

function CloudBackupSection() {
  const {
    supported,
    enabled,
    providerLabel,
    lastLabel,
    backupPending,
    restorePending,
    busy,
    handleToggle,
    handleBackupNow,
    handleRestore,
  } = useCloudBackupUi();

  if (!supported) return null;

  return (
    <>
      <SectionHeader
        title={`${providerLabel} Backup`}
        description={`Keep an automatic encrypted copy in your ${providerLabel} so you can recover if you lose or switch phones.`}
      />

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
          accessibilityLabel="Auto backup daily"
          trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
          thumbColor={COLORS.WHITE}
        />
      </View>

      <Row
        icon={CloudUpload}
        label="Back up now"
        description={`Run a one-off backup to ${providerLabel} right now.`}
        loading={backupPending}
        disabled={busy}
        onPress={handleBackupNow}
      />
      <Row
        icon={CloudDownload}
        label={`Restore from ${providerLabel}`}
        description="Replace everything on this device with your latest cloud backup. Destructive."
        loading={restorePending}
        disabled={busy}
        onPress={handleRestore}
      />
    </>
  );
}

function Row({
  icon,
  label,
  description,
  loading = false,
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
    >
      <Icon as={icon} className="mr-3 size-4 text-muted-foreground" />
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {loading && <ActivityIndicator size="small" color={COLORS.PRIMARY} />}
    </Pressable>
  );
}

export const ErrorBoundary = ScreenError;

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
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useExportDatabase, useImportDatabase } from "@/hooks/use-cloud-backup";
import { useCloudBackupUi } from "@/hooks/use-cloud-backup-ui";
import { COLORS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { initDB } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const ExportSheet = lazy(() =>
  import("@/components/export-sheet").then((m) => ({
    default: m.ExportSheet,
  })),
);

export default function ExportScreen() {
  const [showExport, setShowExport] = useState(false);
  const exportMutation = useExportDatabase();
  const importMutation = useImportDatabase();

  async function handleDbExport() {
    try {
      await exportMutation.mutateAsync();
      showSuccessToast("Database exported");
    } catch (err) {
      showErrorToast("Export failed", err);
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
            try {
              const result = await importMutation.mutateAsync();
              if (!result.imported) return;
              // Bring the imported DB up to the current schema before any
              // query runs against it — otherwise a backup from an older
              // app version would crash queries that expect new columns.
              await initDB();
              showSuccessToast("Database imported");
            } catch (err) {
              showErrorToast("Import failed", err);
            }
          },
        },
      ],
    );
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
          disabled={exportMutation.isPending || importMutation.isPending}
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
          disabled={exportMutation.isPending || importMutation.isPending}
          onPress={handleDbExport}
        />
        <Row
          icon={Upload}
          label="Import Database"
          description="Replace all current data with a backup file. Destructive."
          loading={importMutation.isPending}
          disabled={exportMutation.isPending || importMutation.isPending}
          onPress={handleDbImport}
        />

        <CloudBackupSection />
      </ScrollView>

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

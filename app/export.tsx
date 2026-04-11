import { useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileText,
  type LucideIcon,
  Upload,
} from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
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
              await queryClient.invalidateQueries();
              showSuccessToast(
                "Database imported",
                "Restart the app to apply changes",
              );
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

      <Suspense fallback={null}>
        <ExportSheet
          visible={showExport}
          onClose={() => setShowExport(false)}
        />
      </Suspense>
    </View>
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

import { format } from "date-fns";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { PeriodPicker } from "@/components/period-picker";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { COLORS, type PeriodPresetType } from "@/lib/constants";
import { getAllTransactionsFiltered } from "@/lib/db";
import { exportToCSV } from "@/lib/export/csv";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

type ExportSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ExportSheet({ visible, onClose }: ExportSheetProps) {
  const [exporting, setExporting] = useState(false);
  const [preset, setPreset] = useState<PeriodPresetType | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const transactions = await getAllTransactionsFiltered(
        dateFrom || dateTo ? { dateFrom, dateTo } : undefined,
      );
      if (transactions.length === 0) {
        showErrorToast("No transactions to export");
        return;
      }
      const parts = ["kharcha"];
      if (dateFrom) {
        parts.push(
          format(new Date(`${dateFrom}T00:00`), "MMMM-yyyy").toLowerCase(),
        );
      } else {
        parts.push(format(new Date(), "yyyy-MM-dd"));
      }
      await exportToCSV(transactions, parts.join("-"));
      showSuccessToast("Exported", `${transactions.length} transactions`);
      onClose();
    } catch (err) {
      showErrorToast("Export failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-4 text-base font-bold text-foreground">
        Export as CSV
      </Text>

      <PeriodPicker
        preset={preset}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onPresetChange={setPreset}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <View className={cn("mt-4", isIOS && "mb-6")}>
        <Button
          className="h-14 rounded-2xl bg-primary"
          onPress={handleExport}
          disabled={exporting}
          accessibilityLabel="Export"
          accessibilityState={{ busy: exporting, disabled: exporting }}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={COLORS.WHITE} />
          ) : (
            <Text className="text-base font-semibold text-primary-foreground">
              {preset ? "Export" : "Export All"}
            </Text>
          )}
        </Button>
      </View>
    </BottomSheet>
  );
}

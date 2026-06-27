import { format } from "date-fns";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
import type { BackupStats } from "@/lib/db/inspect";
import { formatCurrency, parseDate } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

type Props = {
  visible: boolean;
  loading: boolean;
  importing: boolean;
  stats: BackupStats | null;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ImportPreviewSheet({
  visible,
  loading,
  importing,
  stats,
  error,
  onClose,
  onConfirm,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-1 text-base font-bold text-foreground">
        Confirm Import
      </Text>
      <Text className="mb-4 text-xs text-muted-foreground">
        Replaces all current data with this backup. Review before confirming.
      </Text>

      {loading ? (
        <View className="items-center justify-center py-10">
          <ActivityIndicator size="small" color={COLORS.PRIMARY} />
          <Text className="mt-3 text-xs text-muted-foreground">
            Reading backup…
          </Text>
        </View>
      ) : error ? (
        <View
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
        >
          <Text className="text-sm font-medium text-negative-text">
            Backup rejected
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">{error}</Text>
        </View>
      ) : stats ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 420 }}
        >
          <DateRangeRow oldest={stats.oldestDate} newest={stats.newestDate} />

          <Section label="Transactions" value={stats.transactionCount} />
          <SubRow
            label="Income"
            value={`${stats.incomeCount} · ${formatCurrency(stats.incomeTotal)}`}
          />
          <SubRow
            label="Expenses"
            value={`${stats.expenseCount} · ${formatCurrency(stats.expenseTotal)}`}
          />
          {stats.transferCount > 0 && (
            <SubRow label="Transfers" value={`${stats.transferCount}`} />
          )}
          {stats.investmentCount > 0 && (
            <SubRow label="Investments" value={`${stats.investmentCount}`} />
          )}

          {stats.subscriptionCount > 0 && (
            <Section
              label="Active subscriptions"
              value={`${stats.subscriptionCount} · ${formatCurrency(stats.subscriptionMonthly)}/mo`}
            />
          )}

          {stats.holdingCount > 0 && (
            <Section
              label="Open holdings"
              value={`${stats.holdingCount} · ${formatCurrency(stats.holdingInvested)} invested`}
            />
          )}

          <Section
            label="Categories · Sources · Tags"
            value={`${stats.categoryCount} · ${stats.sourceCount} · ${stats.tagCount}`}
          />

          {stats.budgetCount > 0 && (
            <Section label="Budgets" value={stats.budgetCount} />
          )}
        </ScrollView>
      ) : null}

      <View className={cn("mt-4 flex-row gap-3", isIOS && "mb-2")}>
        <Button
          variant="outline"
          className="h-12 flex-1 rounded-xl border-border"
          onPress={onClose}
          disabled={importing}
        >
          <Text className="text-sm font-medium text-muted-foreground">
            Cancel
          </Text>
        </Button>
        <Button
          variant="destructive"
          className="h-12 flex-1 rounded-xl"
          onPress={onConfirm}
          disabled={loading || importing || !!error || !stats}
          accessibilityLabel="Replace data"
          accessibilityState={{
            busy: importing,
            disabled: loading || importing || !!error || !stats,
          }}
        >
          {importing ? (
            <ActivityIndicator size="small" color={COLORS.WHITE} />
          ) : (
            <Text className="text-sm font-semibold text-primary-foreground">
              Replace data
            </Text>
          )}
        </Button>
      </View>
    </BottomSheet>
  );
}

function Section({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-xl bg-background px-4 py-3">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-xl bg-background/50 px-4 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-xs font-medium text-foreground">{value}</Text>
    </View>
  );
}

function DateRangeRow({
  oldest,
  newest,
}: {
  oldest: string | null;
  newest: string | null;
}) {
  if (!oldest || !newest) {
    return (
      <View className="mb-3 rounded-xl bg-background px-4 py-3">
        <Text className="text-xs text-muted-foreground">
          No transactions in backup
        </Text>
      </View>
    );
  }
  const from = format(parseDate(oldest), "MMM yyyy");
  const to = format(parseDate(newest), "MMM yyyy");
  const label = from === to ? from : `${from} → ${to}`;
  return (
    <View className="mb-3 rounded-xl bg-primary/10 px-4 py-3">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        Date range
      </Text>
      <Text className="mt-1 text-sm font-semibold text-foreground">
        {label}
      </Text>
    </View>
  );
}

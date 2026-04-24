import { format as formatDate, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { GainLabel } from "@/components/ui/gain-label";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  useCloseHolding,
  useDeleteHolding,
  useHolding,
  useHoldingTransactions,
  useReopenHolding,
  useUpdateHoldingPrice,
} from "@/hooks/use-holdings";
import { showDeleteConfirm } from "@/lib/alerts";
import {
  COLORS,
  DATE_FORMAT,
  editScreen,
  INSTRUMENT_LABEL,
  isUnitlessInstrument,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export default function HoldingDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const { format } = useCurrency();
  const { data: holding, isLoading } = useHolding(id);
  const { data: txs = [] } = useHoldingTransactions(id);
  const updatePrice = useUpdateHoldingPrice();
  const closeMutation = useCloseHolding();
  const reopenMutation = useReopenHolding();
  const deleteMutation = useDeleteHolding();
  const [priceSheetVisible, setPriceSheetVisible] = useState(false);

  if (isLoading || !holding) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }

  const currentValue = holding.current_value ?? holding.invested;
  const gain = currentValue - holding.invested;
  const gainPct = holding.invested > 0 ? (gain / holding.invested) * 100 : 0;
  const lastUpdated = holding.last_price_updated_at
    ? formatDate(parseISO(holding.last_price_updated_at), DATE_FORMAT)
    : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={holding.name} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <View className="mx-5 mb-4 rounded-2xl bg-card p-5">
          <Text className="text-xs font-medium text-muted-foreground">
            {INSTRUMENT_LABEL[holding.instrument_type]}
            {holding.is_closed === 1 ? " · Closed" : ""}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-foreground">
            {format(currentValue)}
          </Text>
          <View className="mt-1">
            <GainLabel amount={gain} pct={gainPct} variant="text" />
          </View>

          <View className="mt-4 flex-row flex-wrap gap-4">
            <Stat label="Invested" value={format(holding.invested)} />
            {!isUnitlessInstrument(holding.instrument_type) && (
              <>
                <Stat label="Units" value={holding.units.toFixed(4)} />
                <Stat
                  label="Avg Cost"
                  value={holding.avg_cost > 0 ? format(holding.avg_cost) : "—"}
                />
              </>
            )}
          </View>

          {lastUpdated && (
            <Text className="mt-3 text-[11px] text-muted-foreground">
              Price updated {lastUpdated}
            </Text>
          )}

          <View className="mt-4 flex-row gap-2">
            <Button
              className="h-10 flex-1 rounded-xl bg-primary"
              onPress={() => setPriceSheetVisible(true)}
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                Update price
              </Text>
            </Button>
            <Button
              variant="outline"
              className="h-10 flex-1 rounded-xl border-border"
              onPress={() => {
                if (holding.is_closed === 1) {
                  reopenMutation.mutate(id, {
                    onSuccess: () => showSuccessToast("Holding reopened"),
                    onError: (err) => showErrorToast("Failed to reopen", err),
                  });
                } else {
                  closeMutation.mutate(id, {
                    onSuccess: () => showSuccessToast("Holding closed"),
                    onError: (err) => showErrorToast("Failed to close", err),
                  });
                }
              }}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                {holding.is_closed === 1 ? "Reopen" : "Close"}
              </Text>
            </Button>
          </View>
        </View>

        <Text className="mx-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transactions ({txs.length})
        </Text>
        {txs.length === 0 ? (
          <Text className="mx-5 text-sm text-muted-foreground">
            No transactions yet. Add a Buy from the Add screen.
          </Text>
        ) : (
          txs.map((tx) => (
            <Pressable
              key={tx.id}
              onPress={() => router.push(editScreen(tx.id))}
              className="mx-5 mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-foreground">
                  {(tx.investment_kind ?? "").toUpperCase()}
                  {tx.units ? ` · ${tx.units.toFixed(4)} units` : ""}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(parseISO(tx.date), DATE_FORMAT)}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-foreground">
                {format(tx.amount)}
              </Text>
            </Pressable>
          ))
        )}

        {holding.is_closed === 1 && txs.length === 0 && (
          <View className="mx-5 mt-4">
            <Button
              variant="outline"
              className="h-10 rounded-xl border-negative"
              onPress={() =>
                showDeleteConfirm(
                  "Delete holding?",
                  "This cannot be undone.",
                  () => {
                    deleteMutation.mutate(id, {
                      onSuccess: () => {
                        showSuccessToast("Holding deleted");
                        router.back();
                      },
                      onError: (err) => showErrorToast("Failed to delete", err),
                    });
                  },
                )
              }
            >
              <Text className="text-sm font-medium text-negative">
                Delete holding
              </Text>
            </Button>
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={priceSheetVisible}
        onClose={() => setPriceSheetVisible(false)}
        title="Update Current Value"
        placeholder="Enter current value"
        submitLabel="Save"
        keyboardType="decimal-pad"
        onSave={async (value) => {
          const num = Number(value);
          if (!Number.isFinite(num) || num < 0) {
            showErrorToast("Invalid value");
            return;
          }
          try {
            await updatePrice.mutateAsync({ id, currentValue: num });
            setPriceSheetVisible(false);
            showSuccessToast("Price updated");
          } catch (err) {
            showErrorToast("Failed to update price", err);
          }
        }}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

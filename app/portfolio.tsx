import { router } from "expo-router";
import { lazy, Suspense, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DashedAddButton } from "@/components/ui/dashed-add-button";
import { GainLabel } from "@/components/ui/gain-label";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  useAddHolding,
  useAllHoldingsWithStats,
  usePortfolioSummary,
} from "@/hooks/use-holdings";
import {
  holdingScreen,
  INSTRUMENT_LABEL,
  INSTRUMENT_TYPE,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddHoldingSheet = lazy(() => import("@/components/add-holding-sheet"));

export default function PortfolioScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { format } = useCurrency();
  const { data: holdings = [] } = useAllHoldingsWithStats();
  const { data: summary } = usePortfolioSummary();
  const addMutation = useAddHolding();

  const invested = summary?.invested ?? 0;
  const currentValue = summary?.current_value ?? 0;
  const gain = summary?.unrealized_gain ?? 0;
  const gainPct = summary?.unrealized_gain_pct ?? 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Portfolio" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <View className="mx-5 mb-4 rounded-2xl bg-card p-5">
          <Text className="text-xs font-medium text-muted-foreground">
            Current Value
          </Text>
          <Text className="mt-1 text-3xl font-bold text-foreground">
            {format(currentValue)}
          </Text>
          <View className="mt-3 flex-row items-center gap-4">
            <View>
              <Text className="text-[11px] text-muted-foreground">
                Invested
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {format(invested)}
              </Text>
            </View>
            <GainLabel amount={gain} pct={gainPct} variant="pill" />
          </View>
        </View>

        <ScreenDescription>
          Track mutual funds, stocks, FDs, and more. Update current value
          anytime to see unrealized P&amp;L.
        </ScreenDescription>

        {holdings.map((h) => {
          const curr = h.current_value ?? h.invested;
          return (
            <Pressable
              key={h.id}
              onPress={() => router.push(holdingScreen(h.id))}
              className="mx-5 mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-foreground">
                  {h.name}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {INSTRUMENT_LABEL[h.instrument_type]}
                  {h.units > 0 ? ` · ${h.units.toFixed(4)} units` : ""}
                  {h.is_closed === 1 ? " · closed" : ""}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-foreground">
                  {format(curr)}
                </Text>
                <GainLabel
                  amount={h.unrealized_gain}
                  pct={h.unrealized_gain_pct}
                  variant="right-aligned"
                  showAmount={false}
                />
              </View>
            </Pressable>
          );
        })}

        <View className="mx-5 mt-2">
          <DashedAddButton
            label="Add Holding"
            onPress={() => setShowAdd(true)}
          />
        </View>
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <AddHoldingSheet
            visible={showAdd}
            onClose={() => setShowAdd(false)}
            onSave={async (name, instrumentType) => {
              try {
                const { isNew } = await addMutation.mutateAsync({
                  name,
                  instrument_type: instrumentType,
                });
                setShowAdd(false);
                showSuccessToast(
                  isNew ? "Holding added" : "Already exists — kept existing",
                );
              } catch (err) {
                showErrorToast("Failed to add holding", err);
              }
            }}
            defaultInstrumentType={INSTRUMENT_TYPE.MUTUAL_FUND}
          />
        </ComponentErrorBoundary>
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

import { router } from "expo-router";
import { lazy, Suspense, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DashedAddButton } from "@/components/ui/dashed-add-button";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  useAddHolding,
  useAllHoldings,
  usePortfolioSummary,
} from "@/hooks/use-holdings";
import {
  holdingScreen,
  INSTRUMENT_LABEL,
  INSTRUMENT_TYPE,
  LABELS,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddHoldingSheet = lazy(() => import("@/components/add-holding-sheet"));

export default function PortfolioScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { format } = useCurrency();
  const { data: holdings = [] } = useAllHoldings();
  const { data: summary } = usePortfolioSummary();
  const addMutation = useAddHolding();

  const invested = summary?.invested ?? 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Portfolio" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <View className="mx-5 mb-4 rounded-2xl bg-card p-5">
          <Text className="text-xs font-medium text-muted-foreground">
            {LABELS.TOTAL_INVESTED}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-foreground">
            {format(invested)}
          </Text>
        </View>

        <ScreenDescription>
          Track contributions to mutual funds, stocks, FDs, PPF, and more across
          your accounts.
        </ScreenDescription>

        {holdings.map((h) => (
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
            <Text className="text-sm font-semibold text-foreground">
              {format(h.invested)}
            </Text>
          </Pressable>
        ))}

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

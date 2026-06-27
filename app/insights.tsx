import {
  addMonths,
  endOfMonth,
  format,
  isSameMonth,
  subMonths,
} from "date-fns";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import {
  SpendingHeatmap,
  SpendingHeatmapLegend,
} from "@/components/spending-heatmap";
import { SpendingPanel } from "@/components/spending-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { WrapStats } from "@/components/wrap-stats";
import { useCurrency } from "@/hooks/use-currency";
import { useInsightsData } from "@/hooks/use-insights-data";
import {
  DATE_ISO_FORMAT,
  MONTH_FORMAT,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { historyHref } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function InsightsScreen() {
  const { format: fmt } = useCurrency();
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const isCurrentMonth = isSameMonth(selectedDate, now);
  const selectedMonth = format(selectedDate, MONTH_FORMAT);
  const prevMonth = format(subMonths(selectedDate, 1), MONTH_FORMAT);
  const monthLabel = format(selectedDate, "MMMM yyyy");
  const prevMonthLabel = format(subMonths(selectedDate, 1), "MMMM");
  const asOf = isCurrentMonth
    ? undefined
    : format(endOfMonth(selectedDate), DATE_ISO_FORMAT);
  const data = useInsightsData(selectedMonth, prevMonth, asOf);

  useEffect(() => {
    logEvent(FIREBASE_EVENTS.INSIGHTS_VIEWED);
  }, []);

  function navigateMonth(next: Date) {
    Haptics.selectionAsync();
    setSelectedDate(next);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Insights" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <View className="mt-2 flex-row items-center justify-between px-6">
          <Pressable
            onPress={() => navigateMonth(subMonths(selectedDate, 1))}
            hitSlop={12}
            className="rounded-full p-2"
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Icon as={ChevronLeft} className="size-6 text-muted-foreground" />
          </Pressable>
          <Text className="text-base font-medium text-muted-foreground">
            {monthLabel}
          </Text>
          <Pressable
            onPress={() =>
              !isCurrentMonth && navigateMonth(addMonths(selectedDate, 1))
            }
            hitSlop={12}
            className="rounded-full p-2"
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Icon
              as={ChevronRight}
              className={cn(
                "size-6",
                isCurrentMonth
                  ? "text-muted-foreground/40"
                  : "text-muted-foreground",
              )}
            />
          </Pressable>
        </View>

        {data.error && !data.isLoading ? (
          <View className="mt-12">
            <QueryErrorState
              title="Couldn't load insights"
              error={data.error}
            />
          </View>
        ) : data.hasData ? (
          <View className="mx-5 mt-4 rounded-2xl border border-border bg-card p-5">
            <ComponentErrorBoundary name="insights.stats">
              <WrapStats
                data={data}
                fmt={fmt}
                monthLabel={monthLabel}
                prevMonthLabel={prevMonthLabel}
              />
            </ComponentErrorBoundary>
          </View>
        ) : (
          <View className="mt-12">
            <EmptyState
              icon={Receipt}
              title={`No transactions in ${monthLabel}`}
              description="Try a different month or add a transaction."
            />
          </View>
        )}

        <View className="mx-5 mt-4 rounded-2xl border border-border bg-card p-5">
          <Text className="mb-1 text-sm font-semibold text-foreground">
            Spending heatmap
          </Text>
          <Text className="mb-3 text-xs text-muted-foreground">
            Daily spend across {monthLabel}.
          </Text>
          <ComponentErrorBoundary name="insights.heatmap">
            <SpendingHeatmap
              yearMonth={selectedMonth}
              today={format(now, DATE_ISO_FORMAT)}
            />
          </ComponentErrorBoundary>
          <SpendingHeatmapLegend />
        </View>

        {data.hasData ? (
          <>
            <ComponentErrorBoundary name="insights.spending-panel">
              <SpendingPanel selectedMonth={selectedMonth} fmt={fmt} />
            </ComponentErrorBoundary>

            <Pressable
              onPress={() => router.push(historyHref({ month: selectedMonth }))}
              className="items-center pt-2"
              accessibilityRole="button"
            >
              <Text className="text-sm font-medium text-primary-text">
                View all transactions →
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

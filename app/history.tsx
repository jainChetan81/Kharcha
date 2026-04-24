import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  FileDown,
  Receipt,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  UIManager,
  View,
} from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { HistoryInsightsStrip } from "@/components/history-insights-strip";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { TransactionSkeleton } from "@/components/transaction-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCategoriesByType } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { useHistoryFilters } from "@/hooks/use-history-filters";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useAllSources } from "@/hooks/use-sources";
import { useSwipeDelete } from "@/hooks/use-transactions";
import { COLORS, editScreen, TRANSACTION_TYPE } from "@/lib/constants";
import { buildListData, type ListItem } from "@/lib/format";
import { cn, getRefreshControlProps, isIOS } from "@/lib/utils";

const HistoryFiltersSheet = lazy(
  () => import("@/components/history-filters-sheet"),
);

export default function HistoryScreen() {
  const { summary } = useLocalSearchParams<{ summary?: string }>();
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useSyncRefresh();
  const handleSwipeDelete = useSwipeDelete();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    insights,
    searchText,
    setSearchText,
    debouncedSearch,
    showFilters,
    setShowFilters,
    activeFilterCount,
    hasActiveFilters,
    appliedChips,
    allTags,
    openFilters,
    applyFilters,
    clearAllFilters,
    resetAllFilters,
    draftType,
    handleDraftTypeChange,
    draftCategoryId,
    setDraftCategoryId,
    draftSourceId,
    setDraftSourceId,
    draftSourceType,
    setDraftSourceType,
    draftPreset,
    setDraftPreset,
    draftDateFrom,
    setDraftDateFrom,
    draftDateTo,
    setDraftDateTo,
    draftAmountMin,
    setDraftAmountMin,
    draftAmountMax,
    setDraftAmountMax,
    draftReimbursement,
    setDraftReimbursement,
    draftTagIds,
    setDraftTagIds,
    draftHasFilters,
  } = useHistoryFilters();

  // Animate chip row appearance/disappearance so filter pills slide in
  // instead of popping.
  const prevChipCount = useRef(appliedChips.length);
  useEffect(() => {
    if (appliedChips.length !== prevChipCount.current) {
      if (
        Platform.OS === "android" &&
        UIManager.setLayoutAnimationEnabledExperimental
      ) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      prevChipCount.current = appliedChips.length;
    }
  }, [appliedChips.length]);

  const categoryFilterType =
    draftType === TRANSACTION_TYPE.TRANSFER ? TRANSACTION_TYPE.ALL : draftType;
  const { data: categories = [] } = useCategoriesByType(
    categoryFilterType,
    showFilters && draftType !== TRANSACTION_TYPE.TRANSFER,
  );

  const { data: sources = [] } = useAllSources(
    showFilters &&
      draftType !== TRANSACTION_TYPE.INCOME &&
      draftType !== TRANSACTION_TYPE.TRANSFER,
  );

  const allTransactions = data?.pages.flat() ?? [];
  const listData = useMemo(
    () => buildListData(allTransactions),
    [allTransactions],
  );

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">History</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push("/export")}
            className="items-center justify-center rounded-xl border border-border bg-card px-3 py-2"
          >
            <Icon as={FileDown} className="size-4 text-muted-foreground" />
          </Pressable>
          <Pressable
            onPress={openFilters}
            className="relative flex-row items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2"
          >
            <Icon
              as={SlidersHorizontal}
              className="size-4 text-muted-foreground"
            />
            <Text className="text-xs font-medium text-muted-foreground">
              Filter
            </Text>
            {activeFilterCount > 0 && (
              <View className="absolute -right-1.5 -top-1.5 h-4 w-4 items-center justify-center rounded-full bg-primary">
                <Text className="text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {insights && insights.count > 0 && (
        <HistoryInsightsStrip
          insights={insights}
          fmt={fmt}
          defaultExpanded={summary === "1"}
        />
      )}

      {appliedChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
          className="mb-3 flex-grow-0"
        >
          {appliedChips.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={chip.onRemove}
              className="flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"
            >
              <Text className="text-xs text-foreground" numberOfLines={1}>
                {chip.label}
              </Text>
              <Icon as={X} className="size-3 text-muted-foreground" />
            </Pressable>
          ))}
          <Pressable
            onPress={resetAllFilters}
            className="items-center justify-center rounded-full px-3 py-1.5"
          >
            <Text className="text-xs font-medium text-primary">Clear all</Text>
          </Pressable>
        </ScrollView>
      )}

      <View className="mx-5 mb-3 flex-row items-center rounded-xl border border-border bg-card px-3">
        <Icon as={Search} className="mr-2 size-4 text-muted-foreground" />
        <Input
          placeholder="search transactions..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={COLORS.MUTED}
          className="flex-1 border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText("")} className="p-1">
            <Icon as={X} className="size-4 text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <ComponentErrorBoundary>
        <FlashList
          data={listData}
          estimatedItemSize={72}
          keyExtractor={(item) =>
            item.type === "header" ? `h-${item.label}` : `t-${item.data.id}`
          }
          getItemType={(item) => item.type}
          renderItem={({ item }: { item: ListItem }) =>
            item.type === "header" ? (
              <DateHeader label={item.label} />
            ) : (
              <TransactionItem
                item={item.data}
                showTime
                onPress={(id) => router.push(editScreen(id))}
                onSwipeDelete={handleSwipeDelete}
              />
            )
          }
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              {...getRefreshControlProps(refreshing, onRefresh)}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="items-center py-6">
                <ActivityIndicator size="small" color={COLORS.PRIMARY} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <TransactionSkeleton count={10} />
            ) : (
              <EmptyState
                icon={debouncedSearch ? Search : Receipt}
                title={
                  debouncedSearch
                    ? `no results for '${debouncedSearch}'`
                    : "No transactions found"
                }
                description={
                  debouncedSearch && hasActiveFilters
                    ? "try clearing filters or changing your search"
                    : undefined
                }
                inList
              >
                {!debouncedSearch && hasActiveFilters ? (
                  <Pressable onPress={resetAllFilters}>
                    <Text className="text-xs text-primary">Clear filters</Text>
                  </Pressable>
                ) : null}
              </EmptyState>
            )
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 20 }}
        />
      </ComponentErrorBoundary>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <HistoryFiltersSheet
            visible={showFilters}
            onClose={() => setShowFilters(false)}
            draftType={draftType}
            onDraftTypeChange={handleDraftTypeChange}
            draftCategoryId={draftCategoryId}
            onDraftCategoryIdChange={setDraftCategoryId}
            draftSourceId={draftSourceId}
            onDraftSourceIdChange={setDraftSourceId}
            draftSourceType={draftSourceType}
            onDraftSourceTypeChange={setDraftSourceType}
            draftPreset={draftPreset}
            onDraftPresetChange={setDraftPreset}
            draftDateFrom={draftDateFrom}
            onDraftDateFromChange={setDraftDateFrom}
            draftDateTo={draftDateTo}
            onDraftDateToChange={setDraftDateTo}
            draftAmountMin={draftAmountMin}
            onDraftAmountMinChange={setDraftAmountMin}
            draftAmountMax={draftAmountMax}
            onDraftAmountMaxChange={setDraftAmountMax}
            draftReimbursement={draftReimbursement}
            onDraftReimbursementChange={setDraftReimbursement}
            draftTagIds={draftTagIds}
            onDraftTagIdsChange={setDraftTagIds}
            categories={categories}
            sources={sources}
            allTags={allTags}
            onApplyFilters={applyFilters}
            onClearAllFilters={clearAllFilters}
            draftHasFilters={draftHasFilters}
          />
        </ComponentErrorBoundary>
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

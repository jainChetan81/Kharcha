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
import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCategoriesByType } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { useDebounce } from "@/hooks/use-debounce";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useAllSources } from "@/hooks/use-sources";
import { useAllTags } from "@/hooks/use-tags";
import {
  useSwipeDelete,
  useTransactionsPaginated,
} from "@/hooks/use-transactions";
import {
  CATEGORY_SLUG,
  COLORS,
  editScreen,
  PERIOD_PRESET,
  type PeriodPresetType,
  REIMBURSEMENT_FILTER,
  type ReimbursementFilterType,
  SOURCE_TYPE,
  type SourceFilterType,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import { getPresetRange } from "@/lib/date";
import { buildListData, type ListItem } from "@/lib/format";
import { cn, getRefreshControlProps, isIOS } from "@/lib/utils";

const HistoryFiltersSheet = lazy(
  () => import("@/components/history-filters-sheet"),
);

export default function HistoryScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useSyncRefresh();
  const params = useLocalSearchParams<{
    filter?: string;
    category_id?: string;
    source_type?: string;
    preset?: string;
    amount_min?: string;
    amount_max?: string;
    reimbursement?: string;
    tag_id?: string;
  }>();

  // Applied filters
  const [typeFilter, setTypeFilter] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceFilterType>(
    SOURCE_TYPE.ALL,
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetType | null>(
    null,
  );
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [amountMin, setAmountMin] = useState<number | null>(null);
  const [amountMax, setAmountMax] = useState<number | null>(null);
  const [reimbursementFilter, setReimbursementFilter] =
    useState<ReimbursementFilterType>(REIMBURSEMENT_FILTER.ALL);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const handleSwipeDelete = useSwipeDelete();
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  // Draft filters (inside modal)
  const [showFilters, setShowFilters] = useState(false);
  const [draftType, setDraftType] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(null);
  const [draftSourceId, setDraftSourceId] = useState<number | null>(null);
  const [draftSourceType, setDraftSourceType] = useState<SourceFilterType>(
    SOURCE_TYPE.ALL,
  );
  const [draftPreset, setDraftPreset] = useState<PeriodPresetType | null>(null);
  const [draftDateFrom, setDraftDateFrom] = useState<string | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<string | null>(null);
  const [draftAmountMin, setDraftAmountMin] = useState("");
  const [draftAmountMax, setDraftAmountMax] = useState("");
  const [draftReimbursement, setDraftReimbursement] =
    useState<ReimbursementFilterType>(REIMBURSEMENT_FILTER.ALL);
  const [draftTagIds, setDraftTagIds] = useState<number[]>([]);

  const { data: allTags = [] } = useAllTags();

  useEffect(() => {
    if (
      params.filter === TRANSACTION_TYPE.INCOME ||
      params.filter === TRANSACTION_TYPE.EXPENSE ||
      params.filter === TRANSACTION_TYPE.TRANSFER
    ) {
      setTypeFilter(params.filter);
    }
    if (params.category_id && params.category_id !== CATEGORY_SLUG.OTHER) {
      const parsed = Number(params.category_id);
      if (!Number.isNaN(parsed)) {
        setCategoryId(parsed);
      }
    }
    if (
      params.source_type === SOURCE_TYPE.MANUAL ||
      params.source_type === SOURCE_TYPE.SYNCED ||
      params.source_type === SOURCE_TYPE.RECURRING ||
      params.source_type === SOURCE_TYPE.TRANSFER
    ) {
      setSourceTypeFilter(params.source_type);
    }
    if (params.preset) {
      const p = params.preset as PeriodPresetType;
      if (Object.values(PERIOD_PRESET).includes(p)) {
        setPeriodPreset(p);
        if (p !== PERIOD_PRESET.CUSTOM) {
          const range = getPresetRange(p);
          setDateFrom(range.from);
          setDateTo(range.to);
        }
      }
    }
    if (params.amount_min) {
      const parsed = Number(params.amount_min);
      if (!Number.isNaN(parsed)) setAmountMin(parsed);
    }
    if (params.amount_max) {
      const parsed = Number(params.amount_max);
      if (!Number.isNaN(parsed)) setAmountMax(parsed);
    }
    if (
      params.reimbursement === REIMBURSEMENT_FILTER.PENDING ||
      params.reimbursement === REIMBURSEMENT_FILTER.REIMBURSED
    ) {
      setReimbursementFilter(params.reimbursement);
    }
    if (params.tag_id) {
      const parsed = Number(params.tag_id);
      if (!Number.isNaN(parsed)) setTagIds([parsed]);
    }
  }, [
    params.filter,
    params.category_id,
    params.source_type,
    params.preset,
    params.amount_min,
    params.amount_max,
    params.reimbursement,
    params.tag_id,
  ]);

  function handleDraftTypeChange(next: TransactionFilterType) {
    if (next === draftType) return;
    setDraftType(next);
    setDraftCategoryId(null);
    setDraftSourceId(null);
  }

  const { data: otherLookupCategories = [] } = useCategoriesByType(
    "expense",
    params.category_id === CATEGORY_SLUG.OTHER,
  );

  useEffect(() => {
    if (
      params.category_id === CATEGORY_SLUG.OTHER &&
      otherLookupCategories.length > 0
    ) {
      const other = otherLookupCategories.find(
        (c) => c.name.toLowerCase() === CATEGORY_SLUG.OTHER,
      );
      if (other) setCategoryId(other.id);
    }
  }, [params.category_id, otherLookupCategories]);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== TRANSACTION_TYPE.ALL) count++;
    if (categoryId !== null) count++;
    if (sourceId !== null) count++;
    if (sourceTypeFilter !== SOURCE_TYPE.ALL) count++;
    if (dateFrom || dateTo) count++;
    if (amountMin != null) count++;
    if (amountMax != null) count++;
    if (reimbursementFilter !== REIMBURSEMENT_FILTER.ALL) count++;
    if (tagIds.length > 0) count++;
    return count;
  }, [
    typeFilter,
    categoryId,
    sourceId,
    sourceTypeFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    reimbursementFilter,
    tagIds,
  ]);

  const hasActiveFilters = activeFilterCount > 0;

  const filters = {
    type: typeFilter,
    categoryId,
    sourceId: typeFilter === TRANSACTION_TYPE.INCOME ? null : sourceId,
    sourceType: sourceTypeFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    search: debouncedSearch || undefined,
    reimbursement: reimbursementFilter,
    tagIds: tagIds.length > 0 ? tagIds : null,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactionsPaginated(filters);

  const allTransactions = data?.pages.flat() ?? [];
  const listData = buildListData(allTransactions);

  const totalSpent = allTransactions
    .filter((t) => t.type === TRANSACTION_TYPE.EXPENSE)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = allTransactions
    .filter((t) => t.type === TRANSACTION_TYPE.INCOME)
    .reduce((sum, t) => sum + t.amount, 0);
  const totalTransfers = allTransactions
    .filter((t) => t.type === TRANSACTION_TYPE.TRANSFER)
    .reduce((sum, t) => sum + t.amount, 0);

  function openFilters() {
    setDraftType(typeFilter);
    setDraftCategoryId(categoryId);
    setDraftSourceId(sourceId);
    setDraftSourceType(sourceTypeFilter);
    setDraftPreset(periodPreset);
    // Recompute preset range on open so non-custom presets stay fresh
    if (periodPreset && periodPreset !== PERIOD_PRESET.CUSTOM) {
      const range = getPresetRange(periodPreset);
      setDraftDateFrom(range.from);
      setDraftDateTo(range.to);
    } else {
      setDraftDateFrom(dateFrom);
      setDraftDateTo(dateTo);
    }
    setDraftAmountMin(amountMin != null ? String(amountMin) : "");
    setDraftAmountMax(amountMax != null ? String(amountMax) : "");
    setDraftReimbursement(reimbursementFilter);
    setDraftTagIds(tagIds);
    setShowFilters(true);
  }

  function parseAmountInput(raw: string): number | null {
    if (!raw.trim()) return null;
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function applyFilters() {
    // Treat a Custom preset with no dates chosen as "no period filter"
    const effectivePreset =
      draftPreset === PERIOD_PRESET.CUSTOM && !draftDateFrom && !draftDateTo
        ? null
        : draftPreset;
    startTransition(() => {
      setTypeFilter(draftType);
      setCategoryId(draftCategoryId);
      setSourceId(draftSourceId);
      setSourceTypeFilter(draftSourceType);
      setPeriodPreset(effectivePreset);
      setDateFrom(effectivePreset ? draftDateFrom : null);
      setDateTo(effectivePreset ? draftDateTo : null);
      setAmountMin(parseAmountInput(draftAmountMin));
      setAmountMax(parseAmountInput(draftAmountMax));
      setReimbursementFilter(draftReimbursement);
      setTagIds(draftTagIds);
    });
    setShowFilters(false);
  }

  function clearAllFilters() {
    setDraftType(TRANSACTION_TYPE.ALL);
    setDraftCategoryId(null);
    setDraftSourceId(null);
    setDraftSourceType(SOURCE_TYPE.ALL);
    setDraftPreset(null);
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setDraftAmountMin("");
    setDraftAmountMax("");
    setDraftReimbursement(REIMBURSEMENT_FILTER.ALL);
    setDraftTagIds([]);
  }

  function resetAllFilters() {
    setTypeFilter(TRANSACTION_TYPE.ALL);
    setCategoryId(null);
    setSourceId(null);
    setSourceTypeFilter(SOURCE_TYPE.ALL);
    setPeriodPreset(null);
    setDateFrom(null);
    setDateTo(null);
    setAmountMin(null);
    setAmountMax(null);
    setReimbursementFilter(REIMBURSEMENT_FILTER.ALL);
    setTagIds([]);
  }

  const draftHasFilters =
    draftType !== TRANSACTION_TYPE.ALL ||
    draftCategoryId !== null ||
    draftSourceId !== null ||
    draftSourceType !== SOURCE_TYPE.ALL ||
    draftPreset !== null ||
    draftAmountMin !== "" ||
    draftAmountMax !== "" ||
    draftReimbursement !== REIMBURSEMENT_FILTER.ALL ||
    draftTagIds.length > 0;

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

      {allTransactions.length > 0 &&
        (totalSpent > 0 || totalIncome > 0 || totalTransfers > 0) && (
          <View className="mx-5 mb-3 rounded-xl bg-card p-3">
            <Text className="text-xs text-muted-foreground">
              {allTransactions.length} transactions
              {totalSpent > 0 && (
                <>
                  {"  ·  "}
                  <Text className="text-xs font-semibold text-negative">
                    {fmt(totalSpent)} spent
                  </Text>
                </>
              )}
              {totalIncome > 0 && (
                <>
                  {"  ·  "}
                  <Text className="text-xs font-semibold text-positive">
                    {fmt(totalIncome)} income
                  </Text>
                </>
              )}
              {totalTransfers > 0 && (
                <>
                  {"  ·  "}
                  <Text className="text-xs font-semibold text-muted-foreground">
                    {fmt(totalTransfers)} transferred
                  </Text>
                </>
              )}
            </Text>
          </View>
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
          keyExtractor={(item) =>
            item.type === "header" ? `h-${item.label}` : `t-${item.data.id}`
          }
          getItemType={(item) => item.type}
          renderItem={({ item }: { item: ListItem }) =>
            item.type === "header" ? (
              <View className="px-5">
                <DateHeader label={item.label} />
              </View>
            ) : (
              <View className="px-5">
                <TransactionItem
                  item={item.data}
                  showTime
                  onPress={(id) => router.push(editScreen(id))}
                  onSwipeDelete={handleSwipeDelete}
                />
              </View>
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
          }
          contentContainerStyle={{ paddingBottom: 60 }}
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

import { FlashList } from "@shopify/flash-list";
import {
  endOfMonth,
  format,
  parse,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
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
  ScrollView,
  View,
} from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ChipPicker, MultiChipPicker } from "@/components/ui/chip-picker";
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
  COLORS,
  DATE_FORMAT,
  DATE_ISO_FORMAT,
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
import { buildListData, type ListItem } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

const DatePickerModal = lazy(() =>
  import("@/components/ui/date-picker-modal").then((m) => ({
    default: m.DatePickerModal,
  })),
);

const TYPE_FILTERS = Object.values(TRANSACTION_TYPE);
const SOURCE_TYPE_FILTERS = Object.values(SOURCE_TYPE);
const REIMBURSEMENT_FILTERS = Object.values(REIMBURSEMENT_FILTER);

const REIMBURSEMENT_LABELS: Record<ReimbursementFilterType, string> = {
  [REIMBURSEMENT_FILTER.ALL]: "All",
  [REIMBURSEMENT_FILTER.PENDING]: "Pending",
  [REIMBURSEMENT_FILTER.REIMBURSED]: "Reimbursed",
};

const PRESET_LABELS: Record<PeriodPresetType, string> = {
  [PERIOD_PRESET.TODAY]: "Today",
  [PERIOD_PRESET.THIS_WEEK]: "This Week",
  [PERIOD_PRESET.LAST_7_DAYS]: "Last 7 Days",
  [PERIOD_PRESET.THIS_MONTH]: "This Month",
  [PERIOD_PRESET.LAST_MONTH]: "Last Month",
  [PERIOD_PRESET.THIS_YEAR]: "This Year",
  [PERIOD_PRESET.CUSTOM]: "Custom",
};

function getPresetRange(preset: PeriodPresetType): {
  from: string;
  to: string;
} {
  const now = new Date();
  const fmt = (d: Date) => format(d, DATE_ISO_FORMAT);
  switch (preset) {
    case PERIOD_PRESET.TODAY:
      return { from: fmt(now), to: fmt(now) };
    case PERIOD_PRESET.THIS_WEEK:
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(now) };
    case PERIOD_PRESET.LAST_7_DAYS:
      return { from: fmt(subDays(now, 7)), to: fmt(now) };
    case PERIOD_PRESET.THIS_MONTH:
      return { from: fmt(startOfMonth(now)), to: fmt(now) };
    case PERIOD_PRESET.LAST_MONTH: {
      const prev = subMonths(now, 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    case PERIOD_PRESET.THIS_YEAR:
      return { from: fmt(startOfYear(now)), to: fmt(now) };
    default:
      return { from: fmt(now), to: fmt(now) };
  }
}

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
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const { data: allTags = [] } = useAllTags();

  useEffect(() => {
    if (
      params.filter === TRANSACTION_TYPE.INCOME ||
      params.filter === TRANSACTION_TYPE.EXPENSE ||
      params.filter === TRANSACTION_TYPE.TRANSFER
    ) {
      setTypeFilter(params.filter);
    }
    if (params.category_id && params.category_id !== "other") {
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
    params.category_id === "other",
  );

  useEffect(() => {
    if (params.category_id === "other") {
      const other = otherLookupCategories.find(
        (c) => c.name.toLowerCase() === "other",
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
    if (amountMin != null && amountMin > 0) count++;
    if (amountMax != null && amountMax > 0) count++;
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

  function handlePresetSelect(preset: PeriodPresetType) {
    if (preset === draftPreset) {
      setDraftPreset(null);
      setDraftDateFrom(null);
      setDraftDateTo(null);
      return;
    }
    setDraftPreset(preset);
    if (preset !== PERIOD_PRESET.CUSTOM) {
      const range = getPresetRange(preset);
      setDraftDateFrom(range.from);
      setDraftDateTo(range.to);
    }
  }

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
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.PRIMARY}
              progressViewOffset={40}
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
            <View className="items-center pt-20">
              <Icon
                as={debouncedSearch ? Search : Receipt}
                className="mb-3 size-12 text-muted-foreground"
              />
              <Text className="text-sm text-muted-foreground">
                {debouncedSearch
                  ? `no results for '${debouncedSearch}'`
                  : "No transactions found"}
              </Text>
              {debouncedSearch && hasActiveFilters && (
                <Text className="mt-1 text-xs text-muted-foreground">
                  try clearing filters or changing your search
                </Text>
              )}
              {!debouncedSearch && hasActiveFilters && (
                <Pressable onPress={resetAllFilters} className="mt-2">
                  <Text className="text-xs text-primary">Clear filters</Text>
                </Pressable>
              )}
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </ComponentErrorBoundary>

      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)}>
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-base font-bold text-foreground">Filters</Text>
          {draftHasFilters && (
            <Pressable
              onPress={clearAllFilters}
              className="rounded-xl border border-border px-4 py-2"
            >
              <Text className="text-sm font-medium text-negative">
                Clear All
              </Text>
            </Pressable>
          )}
        </View>

        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Type
        </Text>
        <View className="mb-5 flex-row gap-2">
          {TYPE_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => handleDraftTypeChange(f)}
              className={cn(
                "flex-1 items-center rounded-xl py-2.5",
                draftType === f ? "bg-primary" : "bg-muted",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium capitalize",
                  draftType === f
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {f}
              </Text>
            </Pressable>
          ))}
        </View>

        {draftType !== TRANSACTION_TYPE.TRANSFER && (
          <>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </Text>
            <View className="mb-5">
              <ChipPicker
                items={categories}
                selectedId={draftCategoryId}
                onSelect={setDraftCategoryId}
                allLabel="All Categories"
              />
            </View>
          </>
        )}

        {draftType !== TRANSACTION_TYPE.INCOME &&
          draftType !== TRANSACTION_TYPE.TRANSFER && (
            <>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payment Source
              </Text>
              <View className="mb-5">
                <ChipPicker
                  items={sources}
                  selectedId={draftSourceId}
                  onSelect={setDraftSourceId}
                  allLabel="All Sources"
                />
              </View>
            </>
          )}

        {allTags.length > 0 && (
          <>
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tags
            </Text>
            <View className="mb-5">
              <MultiChipPicker
                items={allTags}
                selectedIds={draftTagIds}
                onChange={setDraftTagIds}
              />
            </View>
          </>
        )}

        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Source Type
        </Text>
        <View className="mb-5 flex-row gap-2">
          {SOURCE_TYPE_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setDraftSourceType(f)}
              className={cn(
                "flex-1 items-center rounded-xl py-2.5",
                draftSourceType === f ? "bg-primary" : "bg-muted",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium capitalize",
                  draftSourceType === f
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {f}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Period
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
          contentContainerStyle={{ gap: 8, paddingRight: 24 }}
        >
          {Object.values(PERIOD_PRESET).map((p) => (
            <Pressable
              key={p}
              onPress={() => handlePresetSelect(p)}
              className={cn(
                "rounded-full px-4 py-2.5",
                draftPreset === p
                  ? "bg-primary"
                  : "border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  draftPreset === p
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {PRESET_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {draftPreset === PERIOD_PRESET.CUSTOM && (
          <View className="mb-3 flex-row gap-3">
            <Pressable
              onPress={() => setShowFromPicker(true)}
              className="flex-1 rounded-xl bg-muted px-4 py-3"
            >
              <Text className="text-xs text-muted-foreground">From</Text>
              <Text className="text-sm font-medium text-foreground">
                {draftDateFrom
                  ? format(
                      parse(draftDateFrom, DATE_ISO_FORMAT, new Date()),
                      DATE_FORMAT,
                    )
                  : "Select"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowToPicker(true)}
              className="flex-1 rounded-xl bg-muted px-4 py-3"
            >
              <Text className="text-xs text-muted-foreground">To</Text>
              <Text className="text-sm font-medium text-foreground">
                {draftDateTo
                  ? format(
                      parse(draftDateTo, DATE_ISO_FORMAT, new Date()),
                      DATE_FORMAT,
                    )
                  : "Select"}
              </Text>
            </Pressable>
          </View>
        )}

        <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reimbursement
        </Text>
        <View className="mb-5 flex-row gap-2">
          {REIMBURSEMENT_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setDraftReimbursement(f)}
              className={cn(
                "flex-1 items-center rounded-xl py-2.5",
                draftReimbursement === f ? "bg-primary" : "bg-muted",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  draftReimbursement === f
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {REIMBURSEMENT_LABELS[f]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Amount
        </Text>
        <View className="mb-5 flex-row gap-3">
          <Input
            placeholder="Min ₹"
            placeholderTextColor={COLORS.MUTED}
            keyboardType="decimal-pad"
            value={draftAmountMin}
            onChangeText={setDraftAmountMin}
            className="flex-1"
          />
          <Input
            placeholder="Max ₹"
            placeholderTextColor={COLORS.MUTED}
            keyboardType="decimal-pad"
            value={draftAmountMax}
            onChangeText={setDraftAmountMax}
            className="flex-1"
          />
        </View>

        <View className={cn("flex-row gap-3", isIOS && "mb-6")}>
          <Pressable
            onPress={() => setShowFilters(false)}
            className="h-14 flex-1 items-center justify-center rounded-xl border border-border"
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Button
            className="h-14 flex-1 rounded-2xl bg-primary"
            onPress={applyFilters}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Apply
            </Text>
          </Button>
        </View>
      </BottomSheet>

      {/* DatePickerModal instances are hoisted outside BottomSheet to avoid
          nested RN Modal issues on Android. */}
      <Suspense fallback={null}>
        <DatePickerModal
          visible={showFromPicker}
          value={
            draftDateFrom
              ? parse(draftDateFrom, DATE_ISO_FORMAT, new Date())
              : new Date()
          }
          title="From Date"
          onConfirm={(date) => {
            setShowFromPicker(false);
            setDraftDateFrom(format(date, DATE_ISO_FORMAT));
          }}
          onCancel={() => setShowFromPicker(false)}
          onClear={() => {
            setShowFromPicker(false);
            setDraftDateFrom(null);
          }}
        />
        <DatePickerModal
          visible={showToPicker}
          value={
            draftDateTo
              ? parse(draftDateTo, DATE_ISO_FORMAT, new Date())
              : new Date()
          }
          title="To Date"
          onConfirm={(date) => {
            setShowToPicker(false);
            setDraftDateTo(format(date, DATE_ISO_FORMAT));
          }}
          onCancel={() => setShowToPicker(false)}
          onClear={() => {
            setShowToPicker(false);
            setDraftDateTo(null);
          }}
        />
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

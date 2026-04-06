import { FlashList } from "@shopify/flash-list";
import { addMonths, format, subMonths } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Receipt,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ChipPicker } from "@/components/ui/chip-picker";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCategoriesByType } from "@/hooks/use-categories";
import { useCurrency } from "@/hooks/use-currency";
import { useDebounce } from "@/hooks/use-debounce";
import { useRefresh } from "@/hooks/use-refresh";
import { useAllSources } from "@/hooks/use-sources";
import {
  useSwipeDelete,
  useTransactionsPaginated,
} from "@/hooks/use-transactions";
import {
  COLORS,
  editScreen,
  SOURCE_TYPE,
  type SourceFilterType,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import { buildListData, type ListItem } from "@/lib/format";
import { useGoogleAuth } from "@/lib/gmail/auth";
import { syncGmailTransactions } from "@/lib/gmail/sync";
import { showErrorToast } from "@/lib/toast";
import { cn, isIOS } from "@/lib/utils";

const TYPE_FILTERS = Object.values(TRANSACTION_TYPE);
const SOURCE_TYPE_FILTERS = Object.values(SOURCE_TYPE);

export default function HistoryScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useRefresh();
  const params = useLocalSearchParams<{
    filter?: string;
    category_id?: string;
    source_type?: string;
    month?: string;
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
  const [month, setMonth] = useState<Date | null>(null);
  const handleSwipeDelete = useSwipeDelete();
  const { isConnected } = useGoogleAuth();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);

  // biome-ignore lint/correctness/useExhaustiveDependencies: isConnected is stable from hook
  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, []);

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
  const [draftMonth, setDraftMonth] = useState<Date | null>(null);

  useEffect(() => {
    if (
      params.filter === TRANSACTION_TYPE.INCOME ||
      params.filter === TRANSACTION_TYPE.EXPENSE
    ) {
      setTypeFilter(params.filter);
    }
    if (params.category_id) {
      const parsed = Number(params.category_id);
      if (!Number.isNaN(parsed)) {
        setCategoryId(parsed);
      }
    }
    if (
      params.source_type === SOURCE_TYPE.MANUAL ||
      params.source_type === SOURCE_TYPE.SYNCED ||
      params.source_type === SOURCE_TYPE.RECURRING
    ) {
      setSourceTypeFilter(params.source_type);
    }
    if (params.month) {
      const [y, m] = params.month.split("-").map(Number);
      if (y && m) setMonth(new Date(y, m - 1));
    }
  }, [params.filter, params.category_id, params.source_type, params.month]);

  // Reset draft category/source when draft type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on draftType change
  useEffect(() => {
    setDraftCategoryId(null);
    setDraftSourceId(null);
  }, [draftType]);

  const { data: categories = [] } = useCategoriesByType(draftType, showFilters);

  const { data: sources = [] } = useAllSources(
    showFilters && draftType !== TRANSACTION_TYPE.INCOME,
  );

  const hasActiveFilters =
    typeFilter !== TRANSACTION_TYPE.ALL ||
    categoryId !== null ||
    sourceId !== null ||
    sourceTypeFilter !== SOURCE_TYPE.ALL ||
    month !== null;

  const filters = {
    type: typeFilter,
    categoryId,
    sourceId: typeFilter === TRANSACTION_TYPE.INCOME ? null : sourceId,
    sourceType: sourceTypeFilter,
    dateFrom: month ? format(month, "yyyy-MM-01") : null,
    dateTo: month
      ? format(
          new Date(month.getFullYear(), month.getMonth() + 1, 0),
          "yyyy-MM-dd",
        )
      : null,
    search: debouncedSearch || undefined,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactionsPaginated(filters);

  const allTransactions = data?.pages.flat() ?? [];
  const listData = buildListData(allTransactions);

  const totalSpent = allTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = allTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  async function handleGmailSync() {
    setSyncing(true);
    try {
      const result = await syncGmailTransactions();
      const lines: string[] = [];
      if (result.expenseCount > 0) {
        lines.push(
          `${result.expenseCount} expense (${fmt(result.expenseTotal)})`,
        );
      }
      if (result.incomeCount > 0) {
        lines.push(`${result.incomeCount} income (${fmt(result.incomeTotal)})`);
      }
      if (result.skipped > 0) {
        lines.push(`${result.skipped} duplicates skipped`);
      }
      if (result.failed > 0) {
        lines.push(`${result.failed} failed to parse`);
      }
      Alert.alert(
        `${result.added} transaction${result.added !== 1 ? "s" : ""} synced`,
        lines.join("\n") || "No new transactions found",
        [{ text: "OK" }],
      );
      if (result.added > 0) {
        setSourceTypeFilter(SOURCE_TYPE.SYNCED);
      }
      await onRefresh();
    } catch (err) {
      showErrorToast("Sync failed", err);
    } finally {
      setSyncing(false);
    }
  }

  function openFilters() {
    setDraftType(typeFilter);
    setDraftCategoryId(categoryId);
    setDraftSourceId(sourceId);
    setDraftSourceType(sourceTypeFilter);
    setDraftMonth(month);
    setShowFilters(true);
  }

  function applyFilters() {
    setTypeFilter(draftType);
    setCategoryId(draftCategoryId);
    setSourceId(draftSourceId);
    setSourceTypeFilter(draftSourceType);
    setMonth(draftMonth);
    setShowFilters(false);
  }

  function clearAllFilters() {
    setDraftType(TRANSACTION_TYPE.ALL);
    setDraftCategoryId(null);
    setDraftSourceId(null);
    setDraftSourceType(SOURCE_TYPE.ALL);
    setDraftMonth(null);
  }

  function resetAllFilters() {
    setTypeFilter(TRANSACTION_TYPE.ALL);
    setCategoryId(null);
    setSourceId(null);
    setSourceTypeFilter(SOURCE_TYPE.ALL);
    setMonth(null);
  }

  const draftHasFilters =
    draftType !== TRANSACTION_TYPE.ALL ||
    draftCategoryId !== null ||
    draftSourceId !== null ||
    draftSourceType !== SOURCE_TYPE.ALL ||
    draftMonth !== null;

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
          {gmailConnected && (
            <Pressable
              onPress={handleGmailSync}
              disabled={syncing}
              className="flex-row items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2"
            >
              {syncing ? (
                <ActivityIndicator size="small" color={COLORS.PRIMARY} />
              ) : (
                <Icon as={Mail} className="size-4 text-muted-foreground" />
              )}
              <Text className="text-xs font-medium text-muted-foreground">
                {syncing ? "Syncing" : "Sync"}
              </Text>
            </Pressable>
          )}
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
            {hasActiveFilters && (
              <View className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Pressable>
        </View>
      </View>

      {allTransactions.length > 0 && (totalSpent > 0 || totalIncome > 0) && (
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
          </Text>
        </View>
      )}

      <View className="mx-5 mb-3 flex-row items-center rounded-xl border border-border bg-card px-3">
        <Icon as={Search} className="mr-2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search merchant or note..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={COLORS.MUTED}
          className="flex-1 border-0 bg-transparent px-0"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText("")} className="p-1">
            <Icon as={X} className="size-4 text-muted-foreground" />
          </Pressable>
        )}
      </View>

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
            <Icon as={Receipt} className="mb-3 size-12 text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              No transactions found
            </Text>
            {hasActiveFilters && (
              <Pressable onPress={resetAllFilters} className="mt-2">
                <Text className="text-xs text-primary">Clear filters</Text>
              </Pressable>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)}>
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-base font-bold text-foreground">Filters</Text>
          {draftHasFilters && (
            <Pressable
              onPress={clearAllFilters}
              className="rounded-lg border border-border px-3 py-1"
            >
              <Text className="text-xs font-medium text-negative">
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
              onPress={() => setDraftType(f)}
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

        {draftType !== TRANSACTION_TYPE.INCOME && (
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
                  "text-xs font-medium capitalize",
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
          Month
        </Text>
        <View className="mb-6 flex-row items-center justify-between rounded-xl bg-muted px-4 py-3">
          <Pressable
            onPress={() =>
              setDraftMonth((prev) => subMonths(prev ?? new Date(), 1))
            }
          >
            <Icon as={ChevronLeft} className="size-5 text-foreground" />
          </Pressable>
          <Pressable onPress={() => setDraftMonth(null)}>
            <Text className="text-sm font-medium text-foreground">
              {draftMonth ? format(draftMonth, "MMMM yyyy") : "All Time"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setDraftMonth((prev) => addMonths(prev ?? new Date(), 1))
            }
          >
            <Icon as={ChevronRight} className="size-5 text-foreground" />
          </Pressable>
        </View>

        <Button
          className="mb-3 h-14 rounded-2xl bg-primary"
          onPress={applyFilters}
        >
          <Text className="text-base font-semibold text-primary-foreground">
            Apply Filters
          </Text>
        </Button>
        <Pressable
          onPress={() => setShowFilters(false)}
          className={cn(
            "h-14 items-center justify-center rounded-xl border border-border",
            isIOS && "mb-6",
          )}
        >
          <Text className="text-sm font-medium text-muted-foreground">
            Cancel
          </Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

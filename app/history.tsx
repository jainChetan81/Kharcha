import { FlashList } from "@shopify/flash-list";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { addMonths, format, subMonths } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Receipt,
  SlidersHorizontal,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  editScreen,
  PAGE_SIZE,
  QUERY_KEYS,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import {
  type Category,
  deleteTransaction,
  getAllCategories,
  getAllSources,
  getCategoriesByType,
  getTransactionsPaginated,
  type Source,
} from "@/lib/db";
import { buildListData, formatINR, type ListItem } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

const TYPE_FILTERS = Object.values(TRANSACTION_TYPE);

function ChipRow({
  items,
  selectedId,
  onSelect,
  allLabel,
}: {
  items: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  allLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      <Pressable
        onPress={() => onSelect(null)}
        className={cn(
          "rounded-full px-3 py-1.5",
          selectedId === null ? "bg-primary" : "bg-muted",
        )}
      >
        <Text
          className={cn(
            "text-xs font-medium",
            selectedId === null
              ? "text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {allLabel}
        </Text>
      </Pressable>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onSelect(item.id === selectedId ? null : item.id)}
          className={cn(
            "rounded-full px-3 py-1.5",
            selectedId === item.id ? "bg-primary" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-medium capitalize",
              selectedId === item.id
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function HistoryScreen() {
  const queryClient = useQueryClient();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();

  // Applied filters
  const [typeFilter, setTypeFilter] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [month, setMonth] = useState<Date | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Draft filters (inside modal)
  const [showFilters, setShowFilters] = useState(false);
  const [draftType, setDraftType] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(null);
  const [draftSourceId, setDraftSourceId] = useState<number | null>(null);
  const [draftMonth, setDraftMonth] = useState<Date | null>(null);

  useEffect(() => {
    if (
      filterParam === TRANSACTION_TYPE.INCOME ||
      filterParam === TRANSACTION_TYPE.EXPENSE
    ) {
      setTypeFilter(filterParam);
    }
  }, [filterParam]);

  // Reset draft category/source when draft type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on draftType change
  useEffect(() => {
    setDraftCategoryId(null);
    setDraftSourceId(null);
  }, [draftType]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: [QUERY_KEYS.CATEGORIES, "filter", draftType],
    queryFn: () =>
      draftType === TRANSACTION_TYPE.ALL
        ? getAllCategories()
        : getCategoriesByType(draftType as "income" | "expense"),
    enabled: showFilters,
  });

  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: [QUERY_KEYS.SOURCES, "filter"],
    queryFn: getAllSources,
    enabled: showFilters && draftType !== TRANSACTION_TYPE.INCOME,
  });

  const hasActiveFilters =
    typeFilter !== TRANSACTION_TYPE.ALL ||
    categoryId !== null ||
    sourceId !== null ||
    month !== null;

  const filters = {
    type: typeFilter,
    categoryId,
    sourceId: typeFilter === TRANSACTION_TYPE.INCOME ? null : sourceId,
    dateFrom: month ? format(month, "yyyy-MM-01") : null,
    dateTo: month
      ? format(
          new Date(month.getFullYear(), month.getMonth() + 1, 0),
          "yyyy-MM-dd",
        )
      : null,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED, filters],
    queryFn: ({ pageParam = 0 }) =>
      getTransactionsPaginated(PAGE_SIZE, pageParam, filters),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });

  const allTransactions = data?.pages.flat() ?? [];
  const listData = buildListData(allTransactions);

  const totalSpent = allTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = allTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  function openFilters() {
    setDraftType(typeFilter);
    setDraftCategoryId(categoryId);
    setDraftSourceId(sourceId);
    setDraftMonth(month);
    setShowFilters(true);
  }

  function applyFilters() {
    setTypeFilter(draftType);
    setCategoryId(draftCategoryId);
    setSourceId(draftSourceId);
    setMonth(draftMonth);
    setShowFilters(false);
  }

  function clearAllFilters() {
    setDraftType(TRANSACTION_TYPE.ALL);
    setDraftCategoryId(null);
    setDraftSourceId(null);
    setDraftMonth(null);
  }

  function resetAllFilters() {
    setTypeFilter(TRANSACTION_TYPE.ALL);
    setCategoryId(null);
    setSourceId(null);
    setMonth(null);
  }

  function confirmDelete(id: number) {
    Alert.alert(
      "Delete Transaction",
      "Are you sure you want to delete this transaction?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => performDelete(id),
        },
      ],
    );
  }

  async function performDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteTransaction(id);
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS],
      });
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      });
      await queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.MONTHLY_SUMMARY],
      });
      Toast.show({ type: "success", text1: "Transaction deleted" });
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Failed to delete",
        text2: String(err),
      });
    } finally {
      setDeletingId(null);
    }
  }

  const draftHasFilters =
    draftType !== TRANSACTION_TYPE.ALL ||
    draftCategoryId !== null ||
    draftSourceId !== null ||
    draftMonth !== null;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn(
          "flex-row items-center justify-between bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <View className="flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-3 py-1">
            <Icon as={ChevronLeft} className="size-6 text-foreground" />
          </Pressable>
          <Text className="text-lg font-bold text-foreground">History</Text>
        </View>
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

      {/* Summary Bar */}
      {allTransactions.length > 0 && (
        <View className="mx-5 mb-3 rounded-xl bg-card p-3">
          <Text className="text-xs text-muted-foreground">
            {allTransactions.length} transactions
            {totalSpent > 0 && (
              <>
                {"  ·  "}
                <Text className="text-xs font-semibold text-negative">
                  {formatINR(totalSpent)} spent
                </Text>
              </>
            )}
            {totalIncome > 0 && (
              <>
                {"  ·  "}
                <Text className="text-xs font-semibold text-positive">
                  {formatINR(totalIncome)} income
                </Text>
              </>
            )}
          </Text>
        </View>
      )}

      {/* Transaction List */}
      <FlashList
        data={listData}
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
                onDelete={confirmDelete}
                isDeleting={deletingId === item.data.id}
              />
            </View>
          )
        }
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator color="#7c3aed" />
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

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setShowFilters(false)}
        />
        <View className="rounded-t-2xl bg-card p-6">
          {/* Modal Header */}
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

          {/* Type */}
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

          {/* Category */}
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Category
          </Text>
          <View className="mb-5">
            <ChipRow
              items={categories}
              selectedId={draftCategoryId}
              onSelect={setDraftCategoryId}
              allLabel="All Categories"
            />
          </View>

          {/* Source — hidden for income */}
          {draftType !== TRANSACTION_TYPE.INCOME && (
            <>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Source
              </Text>
              <View className="mb-5">
                <ChipRow
                  items={sources}
                  selectedId={draftSourceId}
                  onSelect={setDraftSourceId}
                  allLabel="All Sources"
                />
              </View>
            </>
          )}

          {/* Month */}
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

          {/* Actions */}
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
        </View>
      </Modal>
    </View>
  );
}

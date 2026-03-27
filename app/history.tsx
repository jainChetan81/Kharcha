import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import Toast from "react-native-toast-message";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  PAGE_SIZE,
  QUERY_KEYS,
  TRANSACTION_TYPE,
  type TransactionFilterType,
} from "@/lib/constants";
import { deleteTransaction, getTransactionsPaginated } from "@/lib/db";
import { buildListData, type ListItem } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

const FILTERS = Object.values(TRANSACTION_TYPE);

export default function HistoryScreen() {
  const queryClient = useQueryClient();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<TransactionFilterType>(
    TRANSACTION_TYPE.ALL,
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (
      filterParam === TRANSACTION_TYPE.INCOME ||
      filterParam === TRANSACTION_TYPE.EXPENSE
    ) {
      setFilter(filterParam);
    }
  }, [filterParam]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED, filter],
    queryFn: ({ pageParam = 0 }) =>
      getTransactionsPaginated(PAGE_SIZE, pageParam, filter),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });

  const allTransactions = data?.pages.flat() ?? [];
  const listData = buildListData(allTransactions);

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

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="mr-3 py-1">
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">History</Text>
      </View>

      {/* Filter Bar */}
      <View className="px-5 pb-3">
        <View className="flex-row gap-2">
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className={cn(
                "rounded-full px-4 py-2",
                filter === f ? "bg-primary" : "bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium capitalize",
                  filter === f
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

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
            <Text className="text-sm text-muted-foreground">
              No transactions found
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

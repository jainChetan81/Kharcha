import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { CheckCircle2, Receipt, RotateCcw } from "lucide-react-native";
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
import { TransactionSkeleton } from "@/components/transaction-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useSyncRefresh } from "@/hooks/use-refresh";
import { useReimbursementList } from "@/hooks/use-reimbursement-list";
import { COLORS, editScreen, REIMBURSEMENT_FILTER } from "@/lib/constants";
import type { ListItem } from "@/lib/format";
import { cn, getRefreshControlProps } from "@/lib/utils";

export default function ReimbursementsScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useSyncRefresh();
  const {
    setTab,
    isPendingTab,
    pendingCount,
    pendingTotal,
    reimbursedCount,
    reimbursedTotal,
    listData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    markReimbursed,
    markPending,
  } = useReimbursementList();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Reimbursements" />

      <View className="mx-5 mb-4 flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pending
          </Text>
          <Text className="mt-1 text-xl font-bold text-amber-500">
            {fmt(pendingTotal)}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {pendingCount} {pendingCount === 1 ? "expense" : "expenses"}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Reimbursed
          </Text>
          <Text className="mt-1 text-xl font-bold text-positive">
            {fmt(reimbursedTotal)}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {reimbursedCount} {reimbursedCount === 1 ? "expense" : "expenses"}
          </Text>
        </View>
      </View>

      <View className="mx-5 mb-3 flex-row gap-2 rounded-xl bg-card p-1">
        <Pressable
          onPress={() => setTab(REIMBURSEMENT_FILTER.PENDING)}
          className={cn(
            "flex-1 items-center rounded-lg py-2.5",
            isPendingTab ? "bg-primary" : "bg-transparent",
          )}
        >
          <Text
            className={cn(
              "text-sm font-medium",
              isPendingTab
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            Pending
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab(REIMBURSEMENT_FILTER.REIMBURSED)}
          className={cn(
            "flex-1 items-center rounded-lg py-2.5",
            !isPendingTab ? "bg-primary" : "bg-transparent",
          )}
        >
          <Text
            className={cn(
              "text-sm font-medium",
              !isPendingTab
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            Reimbursed
          </Text>
        </Pressable>
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
              <>
                <TransactionItem
                  item={item.data}
                  showTime
                  onPress={(id) => router.push(editScreen(id))}
                />
                <View className="-mt-1 mb-2 flex-row gap-2">
                  {isPendingTab ? (
                    <Pressable
                      onPress={() => markReimbursed(item.data.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-positive bg-positive/10 py-2"
                    >
                      <Icon
                        as={CheckCircle2}
                        className="size-4 text-positive"
                      />
                      <Text className="text-sm font-medium text-positive">
                        Mark reimbursed
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => markPending(item.data.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2"
                    >
                      <Icon
                        as={RotateCcw}
                        className="size-4 text-muted-foreground"
                      />
                      <Text className="text-sm font-medium text-muted-foreground">
                        Move back to pending
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
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
                icon={Receipt}
                title={
                  isPendingTab
                    ? "No pending reimbursements"
                    : "Nothing reimbursed yet"
                }
                description='Toggle "Reimbursable" on any expense to track it here.'
                inList
              />
            )
          }
          contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 20 }}
        />
      </ComponentErrorBoundary>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

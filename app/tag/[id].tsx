import { FlashList } from "@shopify/flash-list";
import { format, parse } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { Pencil, Receipt } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { TagScheduleSheet } from "@/components/tag-schedule-sheet";
import { TagStatusBadge } from "@/components/tag-status-badge";
import { DateHeader, TransactionItem } from "@/components/transaction-item";
import { TransactionSkeleton } from "@/components/transaction-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useTagStats, useUpdateSchedule } from "@/hooks/use-tags";
import {
  useSwipeDelete,
  useTransactionsPaginated,
} from "@/hooks/use-transactions";
import {
  COLORS,
  DATE_DISPLAY_FORMAT,
  DATE_TIME_FORMAT,
  editScreen,
} from "@/lib/constants";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { buildListData, type ListItem } from "@/lib/format";
import { tagStatus } from "@/lib/tag-status";
import { showSuccessToast } from "@/lib/toast";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatDuration(totalMs: number, elapsedMs: number): string {
  if (totalMs < DAY_MS) {
    const totalHours = Math.max(1, Math.round(totalMs / HOUR_MS));
    const elapsedHours = Math.min(
      totalHours,
      Math.max(0, Math.round(elapsedMs / HOUR_MS)),
    );
    return `Hour ${elapsedHours} of ${totalHours}`;
  }
  const totalDays = Math.max(1, Math.round(totalMs / DAY_MS));
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.ceil(elapsedMs / DAY_MS)),
  );
  return `Day ${elapsedDays} of ${totalDays}`;
}

export default function TagDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tagId = Number(id);
  const { format: fmt } = useCurrency();
  const { data: stats, isLoading } = useTagStats(tagId);
  const updateMutation = useUpdateSchedule();
  const handleSwipeDelete = useSwipeDelete();
  const [editVisible, setEditVisible] = useState(false);

  useEffect(() => {
    if (!Number.isNaN(tagId)) {
      logEvent(FIREBASE_EVENTS.TAG_DETAIL_VIEWED, { tag_id: String(tagId) });
    }
  }, [tagId]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" color={COLORS.PRIMARY} />
      </View>
    );
  }

  if (!stats?.tag.start_date || !stats.tag.end_date) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Tag" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Scope not found. Go back and pick another.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <TagDetailLoaded
      tagId={tagId}
      stats={stats}
      startAt={stats.tag.start_date}
      endAt={stats.tag.end_date}
      fmt={fmt}
      handleSwipeDelete={handleSwipeDelete}
      updateMutation={updateMutation}
      editVisible={editVisible}
      setEditVisible={setEditVisible}
    />
  );
}

type TagDetailLoadedProps = {
  tagId: number;
  stats: NonNullable<ReturnType<typeof useTagStats>["data"]>;
  startAt: string;
  endAt: string;
  fmt: (n: number) => string;
  handleSwipeDelete: ReturnType<typeof useSwipeDelete>;
  updateMutation: ReturnType<typeof useUpdateSchedule>;
  editVisible: boolean;
  setEditVisible: (v: boolean) => void;
};

function TagDetailLoaded({
  tagId,
  stats,
  startAt,
  endAt,
  fmt,
  handleSwipeDelete,
  updateMutation,
  editVisible,
  setEditVisible,
}: TagDetailLoadedProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: txLoading,
  } = useTransactionsPaginated({
    tagIds: [tagId],
    dateFrom: startAt,
    dateTo: endAt,
  });

  const allTransactions = useMemo(
    () => data?.pages.flat() ?? [],
    [data?.pages],
  );
  const listData = useMemo(
    () => buildListData(allTransactions),
    [allTransactions],
  );

  const status = tagStatus(startAt, endAt);
  const start = parse(startAt, DATE_TIME_FORMAT, new Date());
  const end = parse(endAt, DATE_TIME_FORMAT, new Date());
  const isShortScope = stats.totalMs < DAY_MS;
  const elapsedDays = stats.elapsedMs / DAY_MS;
  const dailyAverage = elapsedDays > 0 ? stats.total / elapsedDays : 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={`#${stats.tag.name}`}>
        <IconButton
          icon={Pencil}
          tone="muted"
          variant="card"
          accessibilityLabel="Edit schedule"
          onPress={() => setEditVisible(true)}
        />
      </ScreenHeader>

      <FlashList
        data={listData}
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
              onPress={(txId) => router.push(editScreen(txId))}
              onSwipeDelete={handleSwipeDelete}
            />
          )
        }
        ListHeaderComponent={
          <View className="px-5 pb-3 pt-2">
            <View className="rounded-2xl border border-border bg-card p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                  {format(start, DATE_DISPLAY_FORMAT)}
                  {"\n"}→ {format(end, DATE_DISPLAY_FORMAT)}
                </Text>
                <TagStatusBadge status={status} />
              </View>
              <Text className="mt-3 text-3xl font-extrabold text-foreground">
                {fmt(stats.total)}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {formatDuration(stats.totalMs, stats.elapsedMs)}
              </Text>
              <View className="mt-4 h-px bg-border" />
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-sm text-muted-foreground">
                  Top category
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {stats.topCategoryName
                    ? `${stats.topCategoryName} · ${fmt(stats.topCategoryTotal)}`
                    : "—"}
                </Text>
              </View>
              {!isShortScope && (
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Daily average
                  </Text>
                  <Text className="text-sm font-medium text-foreground">
                    {elapsedDays >= 1 ? fmt(dailyAverage) : "—"}
                  </Text>
                </View>
              )}
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-sm text-muted-foreground">
                  Transactions
                </Text>
                <Text className="text-sm font-medium text-foreground">
                  {stats.count}
                </Text>
              </View>
            </View>
          </View>
        }
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          txLoading ? (
            <TransactionSkeleton count={4} />
          ) : (
            <EmptyState
              icon={Receipt}
              title="No transactions tagged yet"
              description={`Tag a transaction with #${stats.tag.name} and it'll show up here.`}
              inList
            />
          )
        }
      />

      <TagScheduleSheet
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        title="Edit schedule"
        submitLabel="Save"
        defaults={{
          name: stats.tag.name,
          startAt,
          endAt,
        }}
        onSubmit={async (values) => {
          try {
            await updateMutation.mutateAsync({ id: tagId, ...values });
            setEditVisible(false);
            showSuccessToast("Schedule updated");
          } catch {
            // useUpdateSchedule's onError already toasted
            // "Failed to update schedule".
          }
        }}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

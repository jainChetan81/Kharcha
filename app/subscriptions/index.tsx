import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  AlertTriangle,
  Pencil,
  Plus,
  Receipt,
  Sparkles,
} from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useRefresh } from "@/hooks/use-refresh";
import {
  type SubscriptionAuditRow,
  type SubscriptionCandidate,
  type SubscriptionRow,
  useDeleteSubscription,
  useSubscriptionCandidates,
  useSubscriptions,
  useSubscriptionsTotal,
  useToggleSubscription,
  useUnusedSubscriptions,
} from "@/hooks/use-subscriptions";
import { showDeleteConfirm } from "@/lib/alerts";
import {
  COLORS,
  DATE_FORMAT,
  editSubscriptionScreen,
  SCREENS,
  SCROLL_BOTTOM_PADDING,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { formatBillingDays, parseBillingDays } from "@/lib/db/subscriptions";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { historyHref, parseDate } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { getRefreshControlProps } from "@/lib/utils";

export default function SubscriptionsScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useRefresh();
  const { data: subs = [] } = useSubscriptions();
  const { data: totalCost = 0 } = useSubscriptionsTotal();
  const { data: unusedSubs = [] } = useUnusedSubscriptions();
  const { data: candidates = [] } = useSubscriptionCandidates();
  const toggleMutation = useToggleSubscription();
  const deleteMutation = useDeleteSubscription();

  const today = new Date().getDate();
  const expenseSubs = subs.filter(
    (s) => s.type !== TRANSACTION_TYPE.INVESTMENT,
  );
  const investmentSubs = subs.filter(
    (s) => s.type === TRANSACTION_TYPE.INVESTMENT,
  );
  const activeExpenseCount = expenseSubs.filter(
    (s) => s.is_active === 1,
  ).length;
  const thisMonth = expenseSubs.filter((s) => s.billing_day <= today);
  const upcoming = expenseSubs.filter((s) => s.billing_day > today);

  function handleDelete(sub: SubscriptionRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    showDeleteConfirm(
      "Delete Subscription",
      `Delete "${sub.name}" and all its transactions?`,
      async () => {
        try {
          await deleteMutation.mutateAsync(sub.id);
          showSuccessToast("Subscription deleted");
        } catch (err) {
          showErrorToast("Failed", err);
        }
      },
    );
  }

  function renderSubCard(sub: SubscriptionRow) {
    const days = parseBillingDays(sub.billing_days, sub.billing_day);
    const dayLabel = formatBillingDays(days);
    return (
      <Pressable
        key={sub.id}
        onPress={() => {
          logEvent(FIREBASE_EVENTS.SUBSCRIPTION_TAPPED);
          router.push(historyHref({ merchant: sub.name }));
        }}
        onLongPress={() => handleDelete(sub)}
        className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">
              {sub.name}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {fmt(sub.amount)} · {dayLabel}
              {sub.category_name ? ` · ${sub.category_name}` : ""}
              {sub.source_name ? ` · ${sub.source_name}` : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(editSubscriptionScreen(sub.id))}
            onLongPress={() => {}}
            hitSlop={12}
            className="mr-3"
            accessibilityRole="button"
            accessibilityLabel={`Edit ${sub.name}`}
          >
            <Icon as={Pencil} className="size-5 text-muted-foreground" />
          </Pressable>
          <Switch
            value={sub.is_active === 1}
            onValueChange={(val) => {
              Haptics.selectionAsync();
              toggleMutation.mutate({ id: sub.id, isActive: val });
            }}
            trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
            thumbColor={COLORS.FOREGROUND}
            accessibilityLabel={`${sub.name} active`}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Subscriptions">
        <Pressable
          onPress={() => router.push(`${SCREENS.ADD}?mode=subscription`)}
          className="rounded-xl border border-border bg-card px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel="Add subscription"
        >
          <Icon as={Plus} className="size-4 text-primary-text" />
        </Pressable>
      </ScreenHeader>

      {subs.length === 0 ? (
        <EmptyState icon={Receipt} title="No subscriptions yet">
          <Pressable
            onPress={() => router.push(`${SCREENS.ADD}?mode=subscription`)}
          >
            <Text className="text-sm font-medium text-primary-text">
              Add your first subscription
            </Text>
          </Pressable>
        </EmptyState>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={SCROLL_BOTTOM_PADDING}
          refreshControl={
            <RefreshControl
              {...getRefreshControlProps(refreshing, onRefresh)}
            />
          }
        >
          <ScreenDescription>
            Recurring charges like Netflix, rent, or insurance. Kharcha
            auto-creates a transaction on each billing day. Toggle off to pause
            tracking without deleting.
          </ScreenDescription>

          {activeExpenseCount > 0 && (
            <View className="mx-5 mt-2 rounded-xl border border-border bg-card p-4">
              <Text className="text-2xl font-bold text-foreground">
                {fmt(totalCost)}
                <Text className="text-sm font-normal text-muted-foreground">
                  /month
                </Text>
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                across {activeExpenseCount} subscription
                {activeExpenseCount !== 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {candidates.length > 0 && (
            <>
              <SectionHeader title="Suggested" />
              {candidates.map((c) => (
                <CandidateSubCard key={c.merchant} candidate={c} fmt={fmt} />
              ))}
            </>
          )}

          {unusedSubs.length > 0 && (
            <>
              <SectionHeader title="Possibly Unused" />
              {unusedSubs.map((sub) => (
                <UnusedSubCard key={sub.id} sub={sub} fmt={fmt} />
              ))}
            </>
          )}

          {thisMonth.length > 0 && (
            <>
              <SectionHeader title="This Month" />
              {thisMonth.map(renderSubCard)}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <SectionHeader title="Upcoming" />
              {upcoming.map(renderSubCard)}
            </>
          )}
          {investmentSubs.length > 0 && (
            <>
              <SectionHeader title="Recurring Investments" />
              {investmentSubs.map(renderSubCard)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function UnusedSubCard({
  sub,
  fmt,
}: {
  sub: SubscriptionAuditRow;
  fmt: (n: number) => string;
}) {
  const lastChargedLabel = sub.last_charged
    ? `Last charged: ${format(parseDate(sub.last_charged), DATE_FORMAT)}`
    : "Never charged";

  return (
    <Pressable
      onPress={() => router.push(editSubscriptionScreen(sub.id))}
      className="mx-5 mb-2 rounded-xl border border-warning bg-card px-4 py-3"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Icon as={AlertTriangle} className="size-4 text-warning" />
            <Text className="text-sm font-semibold text-foreground">
              {sub.name}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-warning">
            {lastChargedLabel}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            Consider cancelling
          </Text>
        </View>
        <Text className="text-sm font-semibold text-foreground">
          {fmt(sub.amount)}
        </Text>
      </View>
    </Pressable>
  );
}

function CandidateSubCard({
  candidate,
  fmt,
}: {
  candidate: SubscriptionCandidate;
  fmt: (n: number) => string;
}) {
  function handleAdd() {
    Haptics.selectionAsync();
    logEvent(FIREBASE_EVENTS.SUBSCRIPTION_CANDIDATE_TAPPED);
    const parts = [
      "mode=subscription",
      `name=${encodeURIComponent(candidate.merchant)}`,
      `amount=${candidate.amount}`,
      `day=${candidate.suggested_day}`,
    ];
    if (candidate.source_id != null)
      parts.push(`sourceId=${candidate.source_id}`);
    if (candidate.category_id != null)
      parts.push(`categoryId=${candidate.category_id}`);
    router.push(`${SCREENS.ADD}?${parts.join("&")}`);
  }

  return (
    <Pressable
      onPress={handleAdd}
      className="mx-5 mb-2 rounded-xl border border-primary/50 bg-card px-4 py-3"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Icon as={Sparkles} className="size-4 text-primary-text" />
            <Text className="text-sm font-semibold text-foreground">
              {candidate.merchant}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {candidate.hits} charges across {candidate.months} months · day{" "}
            {candidate.suggested_day}
          </Text>
          <Text className="mt-0.5 text-xs text-primary-text">
            Add as subscription
          </Text>
        </View>
        <Text className="text-sm font-semibold text-foreground">
          {fmt(candidate.amount)}
        </Text>
      </View>
    </Pressable>
  );
}

export const ErrorBoundary = ScreenError;

import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ClipboardCheck, Plus, Receipt } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useRefresh } from "@/hooks/use-refresh";
import {
  type SubscriptionRow,
  useDeleteSubscription,
  useSubscriptions,
  useToggleSubscription,
} from "@/hooks/use-subscriptions";
import { showDeleteConfirm } from "@/lib/alerts";
import {
  COLORS,
  editSubscriptionScreen,
  SCREENS,
  SCROLL_BOTTOM_PADDING,
} from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { getRefreshControlProps } from "@/lib/utils";

export default function SubscriptionsScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useRefresh();
  const { data: subs = [] } = useSubscriptions();
  const toggleMutation = useToggleSubscription();
  const deleteMutation = useDeleteSubscription();

  const today = new Date().getDate();
  const thisMonth = subs.filter((s) => s.billing_day <= today);
  const upcoming = subs.filter((s) => s.billing_day > today);

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
    return (
      <Pressable
        key={sub.id}
        onPress={() => router.push(editSubscriptionScreen(sub.id))}
        onLongPress={() => handleDelete(sub)}
        className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">
              {sub.name}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {fmt(sub.amount)} · day {sub.billing_day}
              {sub.category_name ? ` · ${sub.category_name}` : ""}
              {sub.source_name ? ` · ${sub.source_name}` : ""}
            </Text>
          </View>
          <Switch
            value={sub.is_active === 1}
            onValueChange={(val) => {
              Haptics.selectionAsync();
              toggleMutation.mutate({ id: sub.id, isActive: val });
            }}
            trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
            thumbColor={COLORS.FOREGROUND}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Subscriptions">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push(SCREENS.SUBSCRIPTION_AUDIT)}
            className="rounded-xl border border-border bg-card px-3 py-2"
          >
            <Icon as={ClipboardCheck} className="size-4 text-primary" />
          </Pressable>
          <Pressable
            onPress={() => router.push(`${SCREENS.ADD}?mode=subscription`)}
            className="rounded-xl border border-border bg-card px-3 py-2"
          >
            <Icon as={Plus} className="size-4 text-primary" />
          </Pressable>
        </View>
      </ScreenHeader>

      {subs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Icon as={Receipt} className="mb-3 size-12 text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            No subscriptions yet
          </Text>
          <Pressable
            onPress={() => router.push(`${SCREENS.ADD}?mode=subscription`)}
            className="mt-3"
          >
            <Text className="text-sm font-medium text-primary">
              Add your first subscription
            </Text>
          </Pressable>
        </View>
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
          {thisMonth.length > 0 && (
            <>
              <Text className="mb-2 mt-2 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                This Month
              </Text>
              {thisMonth.map(renderSubCard)}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <Text className="mb-2 mt-4 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming
              </Text>
              {upcoming.map(renderSubCard)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export const ErrorBoundary = ScreenError;

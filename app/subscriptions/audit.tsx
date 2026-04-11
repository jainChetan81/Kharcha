import { format } from "date-fns";
import { router } from "expo-router";
import { AlertTriangle, Receipt } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useRefresh } from "@/hooks/use-refresh";
import {
  type SubscriptionAuditRow,
  type SubscriptionRow,
  useActiveSubscriptions,
  useSubscriptionsTotal,
  useUnusedSubscriptions,
} from "@/hooks/use-subscriptions";
import { COLORS, DATE_FORMAT, SCREENS } from "@/lib/constants";
import { parseDate } from "@/lib/format";

type CategoryGroup = {
  name: string;
  total: number;
  count: number;
};

function groupByCategory(subs: SubscriptionRow[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const sub of subs) {
    const name = sub.category_name ?? "Uncategorized";
    const group = map.get(name) ?? { name, total: 0, count: 0 };
    group.total += sub.amount;
    group.count += 1;
    map.set(name, group);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export default function SubscriptionAuditScreen() {
  const { format: fmt } = useCurrency();
  const { refreshing, onRefresh } = useRefresh();
  const { data: activeSubs = [] } = useActiveSubscriptions();
  const { data: unusedSubs = [] } = useUnusedSubscriptions();
  const { data: totalCost = 0 } = useSubscriptionsTotal();

  const categoryGroups = groupByCategory(activeSubs);

  if (activeSubs.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Audit" />
        <View className="flex-1 items-center justify-center">
          <Icon as={Receipt} className="mb-3 size-12 text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            No subscriptions added yet
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
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Audit" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.PRIMARY}
            progressViewOffset={40}
          />
        }
      >
        <View className="mx-5 mt-2 rounded-xl border border-border bg-card px-4 py-4">
          <Text className="text-2xl font-bold text-foreground">
            {fmt(totalCost)}
            <Text className="text-sm font-normal text-muted-foreground">
              /month
            </Text>
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            across {activeSubs.length} subscription
            {activeSubs.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {unusedSubs.length > 0 && (
          <>
            <SectionHeader title="Possibly Unused" />
            {unusedSubs.map((sub) => (
              <UnusedSubCard key={sub.id} sub={sub} fmt={fmt} />
            ))}
          </>
        )}

        <SectionHeader title="By Category" />
        {categoryGroups.map((group) => (
          <View
            key={group.name}
            className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">
                {group.name}
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {fmt(group.total)}
              </Text>
            </View>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {group.count} subscription{group.count !== 1 ? "s" : ""}
            </Text>
          </View>
        ))}

        <SectionHeader title="All Subscriptions" />
        {activeSubs.map((sub) => (
          <Pressable
            key={sub.id}
            onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
            className="mx-5 mb-2 rounded-xl border border-border bg-card px-4 py-3"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">
                {sub.name}
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {fmt(sub.amount)}
                <Text className="text-xs font-normal text-muted-foreground">
                  /mo
                </Text>
              </Text>
            </View>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Day {sub.billing_day}
              {sub.category_name ? ` · ${sub.category_name}` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
    <View className="mx-5 mb-2 rounded-xl border border-amber-500 bg-card px-4 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Icon as={AlertTriangle} className="size-4 text-amber-500" />
            <Text className="text-sm font-semibold text-foreground">
              {sub.name}
            </Text>
          </View>
          <Text className="mt-0.5 text-xs text-amber-500">
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
    </View>
  );
}

export const ErrorBoundary = ScreenError;

import { router } from "expo-router";
import { ChevronLeft, Plus, Receipt } from "lucide-react-native";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  type SubscriptionRow,
  useDeleteSubscription,
  useSubscriptions,
  useToggleSubscription,
} from "@/hooks/use-subscriptions";
import { editSubscriptionScreen, SCREENS, TOAST_TYPE } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

export default function SubscriptionsScreen() {
  const { format: fmt } = useCurrency();
  const { data: subs = [] } = useSubscriptions();
  const toggleMutation = useToggleSubscription();
  const deleteMutation = useDeleteSubscription();

  const today = new Date().getDate();
  const thisMonth = subs.filter((s) => s.billing_day <= today);
  const upcoming = subs.filter((s) => s.billing_day > today);

  function handleDelete(sub: SubscriptionRow) {
    Alert.alert(
      "Delete Subscription",
      `Delete "${sub.name}" and all its transactions?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(sub.id);
              Toast.show({
                type: TOAST_TYPE.SUCCESS,
                text1: "Subscription deleted",
              });
            } catch (err) {
              Toast.show({
                type: TOAST_TYPE.ERROR,
                text1: "Failed",
                text2: String(err),
              });
            }
          },
        },
      ],
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
            onValueChange={(val) =>
              toggleMutation.mutate({ id: sub.id, isActive: val })
            }
            trackColor={{ false: "#2a2a2a", true: "#7c3aed" }}
            thumbColor="#f0f0f0"
          />
        </View>
      </Pressable>
    );
  }

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
          <Text className="text-lg font-bold text-foreground">
            Subscriptions
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`${SCREENS.ADD}?mode=subscription`)}
          className="rounded-xl border border-border bg-card px-3 py-2"
        >
          <Icon as={Plus} className="size-4 text-primary" />
        </Pressable>
      </View>

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
          contentContainerStyle={{ paddingBottom: 40 }}
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

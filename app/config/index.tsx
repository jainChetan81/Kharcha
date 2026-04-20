import { router } from "expo-router";
import { CreditCard, Tag, TrendingDown, TrendingUp } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { NavRow } from "@/components/ui/nav-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useAllCategories } from "@/hooks/use-categories";
import { useAllSources } from "@/hooks/use-sources";
import { useAllTags } from "@/hooks/use-tags";
import {
  SCREENS,
  SCROLL_BOTTOM_PADDING,
  TRANSACTION_TYPE,
} from "@/lib/constants";

function CountChip({ count }: { count: number }) {
  return (
    <View className="mr-2 rounded-full bg-muted px-2 py-0.5">
      <Text className="text-[10px] font-medium text-muted-foreground">
        {count}
      </Text>
    </View>
  );
}

export default function ConfigHubScreen() {
  const { data: categories = [] } = useAllCategories();
  const { data: sources = [] } = useAllSources();
  const { data: tags = [] } = useAllTags();

  const expenseCount = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.EXPENSE,
  ).length;
  const incomeCount = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.INCOME,
  ).length;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Config" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-4 pt-2 text-xs text-muted-foreground">
          Add, remove, and reorder the building blocks of your tracking —
          categories, sources, and tags. Tap any entry to manage it.
        </Text>

        <NavRow
          icon={TrendingDown}
          title="Expense Categories"
          description="Buckets for things you spend on."
          accessory={<CountChip count={expenseCount} />}
          onPress={() => router.push(SCREENS.CONFIG_EXPENSE_CATEGORIES)}
        />
        <NavRow
          icon={TrendingUp}
          title="Income Categories"
          description="Buckets for money coming in."
          accessory={<CountChip count={incomeCount} />}
          onPress={() => router.push(SCREENS.CONFIG_INCOME_CATEGORIES)}
        />
        <NavRow
          icon={CreditCard}
          title="Payment Sources"
          description="Cards, accounts, and wallets you pay from."
          accessory={<CountChip count={sources.length} />}
          onPress={() => router.push(SCREENS.CONFIG_SOURCES)}
        />
        <NavRow
          icon={Tag}
          title="Tags"
          description="Cross-cutting labels — trips, events, shared costs."
          accessory={<CountChip count={tags.length} />}
          onPress={() => router.push(SCREENS.TAGS)}
        />
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

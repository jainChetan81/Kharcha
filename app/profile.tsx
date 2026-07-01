import { router } from "expo-router";
import {
  BarChart3,
  ChevronRight,
  Database,
  Download,
  FileText,
  HandCoins,
  Info,
  Layers,
  Lock,
  Mail,
  Repeat,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { VersionFooter } from "@/components/version-footer";

const EditNameSheet = lazy(() => import("@/components/edit-name-sheet"));

import { Icon } from "@/components/ui/icon";
import { NavRow } from "@/components/ui/nav-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useAppLockSetting } from "@/hooks/use-app-lock";
import { isAppUpdateSupported, useAppUpdate } from "@/hooks/use-app-update";
import { useConfig } from "@/hooks/use-config";
import {
  useClearTransactionsWithConfirm,
  useSeedSampleData,
} from "@/hooks/use-transactions";
import { COLORS, SCREENS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { getInitials } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function ProfileScreen() {
  const { userName, updateUserName } = useConfig();
  const [showEditName, setShowEditName] = useState(false);
  const handleClearTransactions = useClearTransactionsWithConfirm();
  const seedMutation = useSeedSampleData();
  const { enabled: appLockEnabled, toggle: toggleAppLock } =
    useAppLockSetting();
  const { checking: checkingUpdate, checkForUpdate } = useAppUpdate();

  const initials = getInitials(userName);

  async function handleSaveName(name: string) {
    await updateUserName(name);
    setShowEditName(false);
    showSuccessToast("Name updated");
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Profile" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <View className="items-center py-6">
          <View className="size-20 items-center justify-center rounded-full bg-primary">
            <Text className="text-2xl font-bold text-primary-foreground">
              {initials}
            </Text>
          </View>
        </View>

        <Text className="mb-2 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Profile
        </Text>
        <Pressable
          onPress={() => setShowEditName(true)}
          accessibilityRole="button"
          className={cn(
            "mx-5 mb-2 flex-row items-center rounded-xl border px-4 py-3",
            userName
              ? "border-border bg-card"
              : "border-primary/40 bg-primary/10",
          )}
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            Name
          </Text>
          <Text
            className={cn(
              "mr-2 text-sm",
              userName
                ? "text-muted-foreground"
                : "font-medium text-primary-text",
            )}
          >
            {userName || "Tap to set"}
          </Text>
          <Icon
            as={ChevronRight}
            className={cn(
              "size-4",
              userName ? "text-muted-foreground" : "text-primary-text",
            )}
          />
        </Pressable>

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Manage
        </Text>
        <NavRow
          icon={Wallet}
          title="Monthly Budgets"
          description="Set per-category monthly spend limits."
          onPress={() => router.push(SCREENS.BUDGETS)}
        />
        <NavRow
          icon={Repeat}
          title="Subscriptions"
          description="Track recurring charges and when they renew."
          onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
        />
        <NavRow
          icon={BarChart3}
          title="Insights"
          description="Monthly summaries and spending trends."
          onPress={() => router.push(SCREENS.INSIGHTS)}
        />
        <NavRow
          icon={TrendingUp}
          title="Portfolio"
          description="Investments, holdings, and contributions."
          onPress={() => router.push(SCREENS.PORTFOLIO)}
        />
        <NavRow
          icon={HandCoins}
          title="Reimbursements"
          description="Expenses you're owed back, fully or in part."
          onPress={() => router.push(SCREENS.REIMBURSEMENTS)}
        />
        <NavRow
          icon={Layers}
          title="Tags"
          description="Group spend by tag; scope a tag to a time window for auto-tagging."
          onPress={() => router.push(SCREENS.TAGS)}
        />
        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sync
        </Text>
        <NavRow
          icon={Mail}
          title="Gmail Sync"
          description="Parse bank emails to auto-import transactions."
          onPress={() => router.push(SCREENS.GMAIL_SYNC)}
        />

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Export
        </Text>
        <NavRow
          icon={FileText}
          title="Export & Backup"
          description="Download your transactions as CSV or JSON."
          onPress={() => router.push(SCREENS.EXPORT)}
        />

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Security
        </Text>
        <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
          <Icon as={Lock} className="mr-3 size-4 text-muted-foreground" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">
              App Lock
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Require Face ID or passcode to open the app.
            </Text>
          </View>
          <Switch
            value={appLockEnabled}
            onValueChange={() => void toggleAppLock()}
            accessibilityLabel="App Lock"
            trackColor={{ false: COLORS.BAR_BG, true: COLORS.PRIMARY }}
            thumbColor={COLORS.WHITE}
          />
        </View>
        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          App
        </Text>
        {isAppUpdateSupported() && (
          <Pressable
            onPress={checkForUpdate}
            disabled={checkingUpdate}
            accessibilityRole="button"
            className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
          >
            <Icon as={Download} className="mr-3 size-4 text-muted-foreground" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Check for Updates
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                Pull the latest build from Expo.
              </Text>
            </View>
            {checkingUpdate ? (
              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
            ) : (
              <Icon
                as={ChevronRight}
                className="size-4 text-muted-foreground"
              />
            )}
          </Pressable>
        )}
        <NavRow
          icon={Info}
          title="About"
          description="App version, device, and data stats."
          onPress={() => router.push(SCREENS.ABOUT)}
        />
        <Pressable
          onPress={handleClearTransactions}
          accessibilityRole="button"
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <View className="flex-1">
            <Text className="text-sm font-medium text-negative-text">
              Clear All Transactions
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Permanently delete every transaction.
            </Text>
          </View>
          <Icon as={Trash2} className="size-4 text-negative-text" />
        </Pressable>
        <Pressable
          onPress={async () => {
            try {
              const seeded = await seedMutation.mutateAsync();
              if (seeded) {
                showSuccessToast("Sample data loaded");
              } else {
                showErrorToast(
                  "Data already exists",
                  "Clear all transactions first",
                );
              }
            } catch (err) {
              showErrorToast("Failed to load sample data", err);
            }
          }}
          accessibilityRole="button"
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Icon as={Database} className="mr-3 size-4 text-muted-foreground" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">
              Load Sample Data
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Populate with fake transactions for demo purposes.
            </Text>
          </View>
        </Pressable>

        <VersionFooter />
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <EditNameSheet
            visible={showEditName}
            onClose={() => setShowEditName(false)}
            userName={userName}
            onSave={handleSaveName}
          />
        </ComponentErrorBoundary>
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

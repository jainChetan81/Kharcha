import { router } from "expo-router";
import {
  ChevronRight,
  Database,
  Download,
  FileText,
  Lock,
  Mail,
  RefreshCw,
  Trash2,
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

const EditNameSheet = lazy(() => import("@/components/edit-name-sheet"));

import { Icon } from "@/components/ui/icon";
import { NavRow } from "@/components/ui/nav-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useAppLockSetting } from "@/hooks/use-app-lock";
import { isAppUpdateSupported, useAppUpdate } from "@/hooks/use-app-update";
import { CURRENCIES, useConfig } from "@/hooks/use-config";
import {
  useDeviceSyncEnabled,
  useGmailSyncEnabled,
} from "@/hooks/use-feature-flags";
import { useUpdateDeviceName } from "@/hooks/use-sync";
import {
  useClearTransactionsWithConfirm,
  useSeedSampleData,
} from "@/hooks/use-transactions";
import { COLORS, SCREENS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { getInitials } from "@/lib/format";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const CurrencyPicker = lazy(() =>
  import("@/components/currency-picker").then((m) => ({
    default: m.CurrencyPicker,
  })),
);

export default function ProfileScreen() {
  const { userName, updateUserName, currency, updateCurrency } = useConfig();
  const [showEditName, setShowEditName] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const handleClearTransactions = useClearTransactionsWithConfirm();
  const seedMutation = useSeedSampleData();
  const { enabled: appLockEnabled, toggle: toggleAppLock } =
    useAppLockSetting();
  const { checking: checkingUpdate, checkForUpdate } = useAppUpdate();

  const gmailSyncEnabled = useGmailSyncEnabled();
  const deviceSyncEnabled = useDeviceSyncEnabled();
  const updateDeviceNameMutation = useUpdateDeviceName();

  const initials = getInitials(userName);

  async function handleSaveName(name: string) {
    await updateUserName(name);
    updateDeviceNameMutation.mutate(name);
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
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary">
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
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            Name
          </Text>
          <Text className="mr-2 text-sm text-muted-foreground">{userName}</Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
        <Pressable
          onPress={() => setShowCurrencyPicker(true)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            Currency
          </Text>
          <Text className="mr-2 text-sm text-muted-foreground">
            {CURRENCIES[currency].symbol} {currency}
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Manage
        </Text>
        <NavRow
          title="Monthly Budgets"
          description="Set per-category monthly spend limits."
          onPress={() => router.push(SCREENS.BUDGETS)}
        />
        <NavRow
          title="Subscriptions"
          description="Track recurring charges and when they renew."
          onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
        />
        {(gmailSyncEnabled || deviceSyncEnabled) && (
          <>
            <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sync
            </Text>
            {gmailSyncEnabled && (
              <NavRow
                icon={Mail}
                title="Gmail Sync"
                description="Parse bank emails to auto-import transactions."
                onPress={() => router.push(SCREENS.GMAIL_SYNC)}
              />
            )}
            {deviceSyncEnabled && (
              <NavRow
                icon={RefreshCw}
                title="Device Sync"
                description="Mirror your data across your other devices."
                onPress={() => router.push(SCREENS.DEVICE_SYNC)}
              />
            )}
          </>
        )}

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
          title="About"
          description="App version, device, and data stats."
          onPress={() => router.push(SCREENS.ABOUT)}
        />
        <Pressable
          onPress={handleClearTransactions}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <View className="flex-1">
            <Text className="text-sm font-medium text-negative">
              Clear All Transactions
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Permanently delete every transaction.
            </Text>
          </View>
          <Icon as={Trash2} className="size-4 text-negative" />
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

      <Suspense fallback={null}>
        <CurrencyPicker
          visible={showCurrencyPicker}
          onClose={() => setShowCurrencyPicker(false)}
          selected={currency}
          onSelect={async (code) => {
            await updateCurrency(code);
            setShowCurrencyPicker(false);
          }}
        />
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

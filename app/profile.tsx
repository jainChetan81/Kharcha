import { useQueryClient } from "@tanstack/react-query";
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
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useAppLockSetting } from "@/hooks/use-app-lock";
import { useAppUpdate } from "@/hooks/use-app-update";
import { CURRENCIES, useConfig } from "@/hooks/use-config";
import { useGmailSyncEnabled } from "@/hooks/use-feature-flags";
import { useClearTransactionsWithConfirm } from "@/hooks/use-transactions";
import { COLORS, SCREENS } from "@/lib/constants";
import { seedSampleData } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const CurrencyPicker = lazy(() =>
  import("@/components/currency-picker").then((m) => ({
    default: m.CurrencyPicker,
  })),
);

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { userName, updateUserName, currency, updateCurrency } = useConfig();
  const [showEditName, setShowEditName] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const handleClearTransactions = useClearTransactionsWithConfirm();
  const { enabled: appLockEnabled, toggle: toggleAppLock } =
    useAppLockSetting();
  const { checking: checkingUpdate, checkForUpdate } = useAppUpdate();

  const gmailSyncEnabled = useGmailSyncEnabled(userName);

  const initials = userName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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
        contentContainerStyle={{ paddingBottom: 40 }}
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
        {gmailSyncEnabled && (
          <Pressable
            onPress={() => router.push(SCREENS.GMAIL_SYNC)}
            className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
          >
            <Icon as={Mail} className="mr-3 size-4 text-muted-foreground" />
            <Text className="flex-1 text-sm font-medium text-foreground">
              Gmail Sync
            </Text>
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push(SCREENS.BUDGETS)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            Monthly Budgets
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
        <Pressable
          onPress={() => router.push(SCREENS.SUBSCRIPTIONS)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            Subscriptions
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sync
        </Text>
        <Pressable
          onPress={() => router.push(SCREENS.DEVICE_SYNC)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Icon as={RefreshCw} className="mr-3 size-4 text-muted-foreground" />
          <Text className="flex-1 text-sm font-medium text-foreground">
            Device Sync
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Export
        </Text>
        <Pressable
          onPress={() => router.push(SCREENS.EXPORT)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Icon as={FileText} className="mr-3 size-4 text-muted-foreground" />
          <Text className="flex-1 text-sm font-medium text-foreground">
            Export & Backup
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>

        <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Security
        </Text>
        <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
          <Icon as={Lock} className="mr-3 size-4 text-muted-foreground" />
          <Text className="flex-1 text-sm font-medium text-foreground">
            App Lock
          </Text>
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
        <Pressable
          onPress={checkForUpdate}
          disabled={checkingUpdate}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Icon as={Download} className="mr-3 size-4 text-muted-foreground" />
          <Text className="flex-1 text-sm font-medium text-foreground">
            Check for Updates
          </Text>
          {checkingUpdate ? (
            <ActivityIndicator size="small" color={COLORS.PRIMARY} />
          ) : (
            <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
          )}
        </Pressable>
        <Pressable
          onPress={() => router.push(SCREENS.ABOUT)}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            About
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
        <Pressable
          onPress={handleClearTransactions}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-negative">
            Clear All Transactions
          </Text>
          <Icon as={Trash2} className="size-4 text-negative" />
        </Pressable>
        <Pressable
          onPress={async () => {
            const seeded = await seedSampleData();
            if (seeded) {
              await queryClient.invalidateQueries();
              showSuccessToast("Sample data loaded");
            } else {
              showErrorToast(
                "Data already exists",
                "Clear all transactions first",
              );
            }
          }}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Icon as={Database} className="mr-3 size-4 text-muted-foreground" />
          <Text className="flex-1 text-sm font-medium text-foreground">
            Load Sample Data
          </Text>
        </Pressable>
      </ScrollView>

      <BottomSheet
        visible={showEditName}
        onClose={() => setShowEditName(false)}
        title="Edit Name"
        placeholder="Your name"
        submitLabel="Save"
        defaultValue={userName}
        onSave={handleSaveName}
      />

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

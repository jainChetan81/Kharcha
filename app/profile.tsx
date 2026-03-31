import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Mail,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { CURRENCIES, type CurrencyCode, useConfig } from "@/hooks/use-config";
import { useClearAllTransactions } from "@/hooks/use-transactions";
import { SCREENS, TOAST_TYPE } from "@/lib/constants";
import { seedSampleData } from "@/lib/db";
import { cn, isIOS } from "@/lib/utils";

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { userName, updateUserName, currency, updateCurrency } = useConfig();
  const [showEditName, setShowEditName] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [draftName, setDraftName] = useState("");
  const clearTransactionsMutation = useClearAllTransactions();

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleClearTransactions() {
    Alert.alert(
      "Clear All Transactions",
      "This will permanently delete all your transactions. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearTransactionsMutation.mutateAsync();
              Toast.show({
                type: TOAST_TYPE.SUCCESS,
                text1: "All transactions deleted",
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

  async function handleSaveName() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    await updateUserName(trimmed);
    setShowEditName(false);
    Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Name updated" });
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">Profile</Text>
        </Pressable>
      </View>

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
          onPress={() => {
            setDraftName(userName);
            setShowEditName(true);
          }}
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
          App
        </Text>
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
              Toast.show({
                type: TOAST_TYPE.SUCCESS,
                text1: "Sample data loaded",
              });
            } else {
              Toast.show({
                type: TOAST_TYPE.ERROR,
                text1: "Data already exists",
                text2: "Clear all transactions first",
              });
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

      <Modal
        visible={showEditName}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditName(false)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setShowEditName(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="rounded-t-2xl bg-card p-6">
            <Text className="mb-4 text-base font-bold text-foreground">
              Edit Name
            </Text>
            <Input
              placeholder="Your name"
              value={draftName}
              onChangeText={setDraftName}
              placeholderTextColor="#888888"
              autoFocus
            />
            <Button
              className="mt-4 h-14 rounded-2xl bg-primary"
              onPress={handleSaveName}
              disabled={!draftName.trim()}
            >
              <Text className="text-base font-semibold text-primary-foreground">
                Save
              </Text>
            </Button>
            <Pressable
              onPress={() => setShowEditName(false)}
              className={cn("mt-3 items-center py-2", isIOS && "mb-4")}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setShowCurrencyPicker(false)}
        />
        <View className="rounded-t-2xl bg-card p-6">
          <Text className="mb-4 text-base font-bold text-foreground">
            Select Currency
          </Text>
          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
            <Pressable
              key={code}
              onPress={async () => {
                await updateCurrency(code);
                setShowCurrencyPicker(false);
              }}
              className="flex-row items-center rounded-xl px-4 py-3"
            >
              <Text className="w-8 text-base font-bold text-foreground">
                {CURRENCIES[code].symbol}
              </Text>
              <Text className="flex-1 text-sm text-foreground">
                {code} — {CURRENCIES[code].name}
              </Text>
              {currency === code && (
                <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Text className="text-xs text-primary-foreground">✓</Text>
                </View>
              )}
            </Pressable>
          ))}
          <Pressable
            onPress={() => setShowCurrencyPicker(false)}
            className={cn("mt-3 items-center py-2", isIOS && "mb-4")}
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

import "react-native-gesture-handler";
import "../global.css";
import { useReactQueryDevTools } from "@dev-plugins/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNetworkLogging } from "react-native-network-logger";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { LockedScreen } from "@/components/locked-screen";
import { Text } from "@/components/ui/text";
import { useAppLock } from "@/hooks/use-app-lock";
import { COLORS, SCREENS, TRANSACTION_TYPE } from "@/lib/constants";
import { initDB } from "@/lib/db";
import { processSubscriptions } from "@/lib/db/subscriptions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { isIOS } from "@/lib/utils";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      gcTime: 1000 * 60 * 30,
    },
  },
});

const TOAST_SHADOW = {
  elevation: 6,
  shadowColor: COLORS.SHADOW,
  shadowOpacity: 0.3,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
} as const;

const toastConfig: ToastConfig = {
  success: ({ text1, text2, props }) => (
    <View
      className="mx-4 mt-2 flex-row items-center rounded-xl border-l-4 border-positive bg-card px-4 py-3"
      style={TOAST_SHADOW}
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{text1}</Text>
        {text2 ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{text2}</Text>
        ) : null}
      </View>
      {props?.formattedAmount ? (
        <Text
          className={`text-sm font-bold ${props.type === TRANSACTION_TYPE.INCOME ? "text-positive" : "text-negative"}`}
        >
          {props.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}
          {props.formattedAmount}
        </Text>
      ) : null}
    </View>
  ),
  error: ({ text1, text2 }) => (
    <View
      className="mx-4 mt-2 flex-row items-center rounded-xl border-l-4 border-negative bg-card px-4 py-3"
      style={TOAST_SHADOW}
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{text1}</Text>
        {text2 ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{text2}</Text>
        ) : null}
      </View>
    </View>
  ),
  undo: ({ text1, props }) => (
    <View
      className="mx-4 mt-2 flex-row items-center rounded-xl bg-card px-4 py-3"
      style={TOAST_SHADOW}
    >
      <Text className="flex-1 text-sm font-semibold text-foreground">
        {text1}
      </Text>
      {props?.onUndo && (
        <Pressable onPress={props.onUndo}>
          <Text className="text-sm font-medium text-primary">Undo</Text>
        </Pressable>
      )}
    </View>
  ),
};

export default function RootLayout() {
  if (__DEV__) {
    startNetworkLogging();
    // biome-ignore lint/correctness/useHookAtTopLevel: __DEV__ is a compile-time constant, hook order is stable
    useReactQueryDevTools(queryClient);
  }

  useQuickActionRouting();

  const [dbReady, setDbReady] = useState(false);
  const { locked, authenticate } = useAppLock();

  useEffect(() => {
    initDB()
      .then(async () => {
        const created = await processSubscriptions();
        if (created.length > 0) {
          showSuccessToast(
            `${created.length} subscription${created.length > 1 ? "s" : ""} renewed`,
            created.join(", "),
          );
        }
        setDbReady(true);
      })
      .catch((err) => {
        showErrorToast("Database Error", err);
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (isIOS) {
      QuickActions.setItems([
        {
          title: "Add Expense",
          subtitle: "Record a new expense",
          icon: "compose",
          id: "add_expense",
          params: { href: `${SCREENS.ADD}?type=expense` },
        },
        {
          title: "Transactions",
          subtitle: "View all transactions",
          icon: "search",
          id: "transactions",
          params: { href: SCREENS.HISTORY },
        },
      ]);
    }
  }, []);

  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <ComponentErrorBoundary name="root">
          <Suspense
            fallback={
              <View className="flex-1 items-center justify-center bg-background">
                <ActivityIndicator size="small" color={COLORS.PRIMARY} />
              </View>
            }
          >
            {dbReady ? (
              locked ? (
                <LockedScreen onUnlock={authenticate} />
              ) : (
                <Stack screenOptions={{ headerShown: false }} />
              )
            ) : null}
          </Suspense>
        </ComponentErrorBoundary>
        <Toast config={toastConfig} position="top" topOffset={60} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

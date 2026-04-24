import "react-native-gesture-handler";
import "../global.css";
import { useReactQueryDevTools } from "@dev-plugins/react-query";
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { router, SplashScreen, Stack, usePathname } from "expo-router";
import { ShareIntentProvider, useShareIntent } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { Suspense, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNetworkLogging } from "react-native-network-logger";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { LockedScreen } from "@/components/locked-screen";
import { Text } from "@/components/ui/text";
import { useAppLock } from "@/hooks/use-app-lock";
import { readAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
import { runSmsListenerDrain } from "@/hooks/use-sms-listener";
import { maybeAutoBackup } from "@/lib/cloud-backup";
import {
  COLORS,
  CONFIG_KEYS,
  QUERY_KEYS,
  SCREENS,
  SHADOWS,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { initDB } from "@/lib/db";
import { getConfig } from "@/lib/db/config";
import { processSubscriptions } from "@/lib/db/subscriptions";
import { getOrCreateDeviceId, registerDevice } from "@/lib/device";
import { logFirebaseError, logScreenView } from "@/lib/firebase";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { isIOS } from "@/lib/utils";
import { syncWidgetData } from "@/lib/widget";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10,
      gcTime: 1000 * 60 * 30,
    },
  },
});

async function autoRegisterDevice() {
  const existing = await getConfig(CONFIG_KEYS.BACKEND_FORWARDING_EMAIL);
  if (existing) {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.FEATURE_FLAGS] });
    return;
  }

  const deviceId = await getOrCreateDeviceId();
  const userName = await getConfig(CONFIG_KEYS.USER_NAME);

  try {
    await registerDevice(
      deviceId,
      userName && userName !== "User" ? userName : undefined,
    );
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.FEATURE_FLAGS] });
  } catch (err) {
    logFirebaseError(err, { operation: "auto_register_device" });
  }
}

const toastConfig: ToastConfig = {
  success: ({ text1, text2, props }) => (
    <View
      className="mx-4 mt-2 flex-row items-center rounded-xl border-l-4 border-positive bg-card px-4 py-3"
      style={SHADOWS.TOAST}
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
      style={SHADOWS.TOAST}
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
      style={SHADOWS.TOAST}
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

function ScreenViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) logScreenView(pathname);
  }, [pathname]);
  return null;
}

function ShareIntentListener() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    const text = shareIntent.text ?? shareIntent.webUrl;
    if (text) {
      router.push(`${SCREENS.SMS_FORWARD}?text=${encodeURIComponent(text)}`);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

export default function RootLayout() {
  if (__DEV__) {
    startNetworkLogging();
    // biome-ignore lint/correctness/useHookAtTopLevel: __DEV__ is a compile-time constant, hook order is stable
    useReactQueryDevTools(queryClient);
  }

  useQuickActionRouting();

  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    GeistMono_400Regular,
  });

  const [dbReady, setDbReady] = useState(false);
  const { locked, authenticate } = useAppLock(dbReady);
  const ready = dbReady && fontsLoaded;

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
        await queryClient.prefetchQuery({
          queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
          queryFn: readAutoRefreshPrefs,
        });
        setDbReady(true);
        syncWidgetData();
        autoRegisterDevice();
        void runSmsListenerDrain(queryClient);
      })
      .catch((err) => {
        showErrorToast("Database Error", err);
      });
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Refresh widget data when app returns to foreground (catches midnight resets)
  // and opportunistically run an auto-backup if it's been >24h since the last.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && dbReady) {
        syncWidgetData();
        void maybeAutoBackup();
        void runSmsListenerDrain(queryClient);
      }
    });
    return () => sub.remove();
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady || __DEV__) return;
    import("@react-native-firebase/crashlytics")
      .then(async (mod) => {
        const crash = mod.default();
        crash.setCrashlyticsCollectionEnabled(true);
        const userName = await getConfig(CONFIG_KEYS.USER_NAME);
        crash.setAttribute("user_name", userName ?? "unknown");
      })
      .catch(() => {});
  }, [dbReady]);

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
      <ShareIntentProvider>
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
              {ready ? (
                locked ? (
                  <LockedScreen onUnlock={authenticate} />
                ) : (
                  <>
                    <ScreenViewTracker />
                    <ShareIntentListener />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        animation: "slide_from_right",
                        animationDuration: 250,
                      }}
                    />
                  </>
                )
              ) : null}
            </Suspense>
          </ComponentErrorBoundary>
          <Toast config={toastConfig} position="top" topOffset={60} />
        </QueryClientProvider>
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

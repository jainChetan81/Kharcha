import "react-native-gesture-handler";
import "../global.css";
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
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { BootErrorScreen } from "@/components/boot-error-screen";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { LockedScreen } from "@/components/locked-screen";
import { MonthlyWrapGate } from "@/components/monthly-wrap-gate";
import { Text } from "@/components/ui/text";
import { useAppLock } from "@/hooks/use-app-lock";
import { readAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
import { useMiniSync } from "@/hooks/use-mini-sync";
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
import { ERROR_TYPE, logFirebaseError, logScreenView } from "@/lib/firebase";
import { deriveMiniSyncEnabled, isConfigured } from "@/lib/mini-sync";
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

const toastConfig: ToastConfig = {
  success: ({ text1, text2, props }) => (
    <View
      accessible
      accessibilityLiveRegion="polite"
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
          className={`text-sm font-bold ${props.type === TRANSACTION_TYPE.INCOME ? "text-positive" : "text-negative-text"}`}
        >
          {props.type === TRANSACTION_TYPE.INCOME ? "+" : "-"}
          {props.formattedAmount}
        </Text>
      ) : null}
    </View>
  ),
  error: ({ text1, text2 }) => (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
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
};

function ScreenViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) logScreenView(pathname);
  }, [pathname]);
  return null;
}

// Pull from the personal mini pipeline on launch and whenever the app returns
// to foreground. Lives under the QueryClientProvider so a successful sync
// invalidates the transaction caches via useMiniSync — synced rows appear
// without a manual refresh. Mounted only once the db is ready and the app is
// unlocked, so the unlock itself also triggers the initial sync.
function ForegroundMiniSync() {
  const { mutate: runMiniSync } = useMiniSync();

  useEffect(() => {
    const maybeSync = () => {
      void (async () => {
        try {
          const configured = isConfigured();
          if (!configured) return;
          const enabledFlag = await getConfig(CONFIG_KEYS.MINI_SYNC_ENABLED);
          if (!deriveMiniSyncEnabled(configured, enabledFlag)) return;
          runMiniSync();
        } catch {
          // Fail silently — foreground sync is best-effort; pull-to-refresh
          // will surface any persistent error with a toast.
        }
      })();
    };

    maybeSync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") maybeSync();
    });
    return () => sub.remove();
  }, [runMiniSync]);

  return null;
}

function ShareIntentListener() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    const text = shareIntent.text ?? shareIntent.webUrl;
    if (text) {
      // Route to /add with the shared text — the add screen auto-opens the
      // AI Parse sheet with the text pre-filled.
      router.push(`${SCREENS.ADD}?text=${encodeURIComponent(text)}`);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

export default function RootLayout() {
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
  const [bootError, setBootError] = useState<Error | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const { locked, authenticate } = useAppLock(dbReady);
  const ready = dbReady && fontsLoaded;

  // biome-ignore lint/correctness/useExhaustiveDependencies: bootAttempt is the trigger — we intentionally re-run the boot chain when it's bumped (via BootErrorScreen's retry), even though the body doesn't reference it.
  useEffect(() => {
    let cancelled = false;
    setBootError(null);

    (async () => {
      // Fatal: without a working database there is nothing for the app to do.
      await initDB();
      if (cancelled) return;

      // Best-effort: failures here are logged and surfaced, but must not
      // block the app from becoming usable.
      try {
        const created = await processSubscriptions();
        if (created.length > 0) {
          showSuccessToast(
            `${created.length} subscription${created.length > 1 ? "s" : ""} renewed`,
            created.join(", "),
          );
        }
      } catch (err) {
        logFirebaseError(err, {
          error_type: ERROR_TYPE.DB,
          boot_step: "processSubscriptions",
        });
        showErrorToast("Some subscriptions may not have renewed", err);
      }

      try {
        await queryClient.prefetchQuery({
          queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
          queryFn: readAutoRefreshPrefs,
        });
      } catch (err) {
        // Non-fatal: useAutoRefreshPrefs() refetches on demand if the
        // prefetch didn't warm the cache.
        logFirebaseError(err, {
          error_type: ERROR_TYPE.DB,
          boot_step: "prefetchSyncPrefs",
        });
      }

      if (cancelled) return;
      setDbReady(true);
      syncWidgetData();
    })().catch((err) => {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      logFirebaseError(error, {
        error_type: ERROR_TYPE.DB,
        boot_step: "initDB",
      });
      setBootError(error);
    });

    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  useEffect(() => {
    if ((dbReady || bootError) && fontsLoaded) SplashScreen.hideAsync();
  }, [dbReady, bootError, fontsLoaded]);

  // Refresh widget data when app returns to foreground (catches midnight
  // resets) and opportunistically run an auto-backup if it's been >24h since
  // the last. The mini pipeline pull lives in <ForegroundMiniSync /> so it can
  // invalidate query caches through the QueryClientProvider.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && dbReady) {
        syncWidgetData();
        void maybeAutoBackup();
      }
    });
    return () => sub.remove();
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady || __DEV__) return;
    import("@react-native-firebase/crashlytics")
      .then((mod) => {
        // Deliberate tradeoff: collection is always-on with no in-app
        // opt-out. This is a single-developer personal app (see
        // docs/V3_SPEC.md) — crash reports go only to the developer's own
        // Firebase project, not a third party with other users' data mixed
        // in. Revisit with a real settings toggle if this app ever gets a
        // wider (non-personal) release.
        mod.default().setCrashlyticsCollectionEnabled(true);
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
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="Loading"
                  className="flex-1 items-center justify-center bg-background"
                >
                  <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                </View>
              }
            >
              {bootError ? (
                <BootErrorScreen
                  error={bootError}
                  onRetry={() => {
                    setBootError(null);
                    setBootAttempt((n) => n + 1);
                  }}
                />
              ) : ready ? (
                locked ? (
                  <LockedScreen onUnlock={authenticate} />
                ) : (
                  <>
                    <ScreenViewTracker />
                    <ForegroundMiniSync />
                    <ShareIntentListener />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        animation: "slide_from_right",
                        animationDuration: 250,
                      }}
                    />
                    <MonthlyWrapGate />
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

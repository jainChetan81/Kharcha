import "../global.css";
import { useReactQueryDevTools } from "@dev-plugins/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { Text } from "@/components/ui/text";
import { TOAST_TYPE, TRANSACTION_TYPE } from "@/lib/constants";
import { initDB } from "@/lib/db";
import { processSubscriptions } from "@/lib/db/subscriptions";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const toastConfig: ToastConfig = {
  success: ({ text1, text2, props }) => (
    <View
      className="mx-4 mt-2 flex-row items-center rounded-xl border-l-4 border-positive bg-card px-4 py-3"
      style={{
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
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
      style={{
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
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
      style={{
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
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
    // biome-ignore lint/correctness/useHookAtTopLevel: __DEV__ is a compile-time constant, hook order is stable
    useReactQueryDevTools(queryClient);
  }

  useQuickActionRouting();

  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDB()
      .then(async () => {
        const created = await processSubscriptions();
        if (created.length > 0) {
          Toast.show({
            type: TOAST_TYPE.SUCCESS,
            text1: `${created.length} subscription${created.length > 1 ? "s" : ""} renewed`,
            text2: created.join(", "),
          });
        }
        setDbReady(true);
      })
      .catch((err) => {
        Toast.show({
          type: TOAST_TYPE.ERROR,
          text1: "Database Error",
          text2: String(err),
        });
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    if (Platform.OS === "ios") {
      QuickActions.setItems([
        {
          title: "Add Expense",
          subtitle: "Record a new expense",
          icon: "compose",
          id: "add_expense",
          params: { href: "/add?type=expense" },
        },
        {
          title: "Transactions",
          subtitle: "View all transactions",
          icon: "search",
          id: "transactions",
          params: { href: "/history" },
        },
      ]);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      {dbReady ? <Stack screenOptions={{ headerShown: false }} /> : null}
      <Toast config={toastConfig} position="top" topOffset={60} />
    </QueryClientProvider>
  );
}

import "../global.css";
import { useReactQueryDevTools } from "@dev-plugins/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Toast, { type ToastConfig } from "react-native-toast-message";
import { Text } from "@/components/ui/text";
import { initDB } from "@/lib/db";

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
      {props?.amount ? (
        <Text
          className={`text-sm font-bold ${props.type === "income" ? "text-positive" : "text-negative"}`}
        >
          {props.type === "income" ? "+" : "-"}₹
          {Number(props.amount).toLocaleString("en-IN")}
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
};

export default function RootLayout() {
  if (__DEV__) {
    // biome-ignore lint/correctness/useHookAtTopLevel: __DEV__ is a compile-time constant, hook order is stable
    useReactQueryDevTools(queryClient);
  }

  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDB()
      .then(() => setDbReady(true))
      .catch((err) => {
        Toast.show({
          type: "error",
          text1: "Database Error",
          text2: String(err),
        });
      })
      .finally(() => SplashScreen.hideAsync());
  }, []);

  if (!dbReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      <Toast config={toastConfig} position="top" topOffset={60} />
    </QueryClientProvider>
  );
}

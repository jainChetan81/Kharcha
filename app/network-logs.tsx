import { View } from "react-native";
import NetworkLogger from "react-native-network-logger";
import { ScreenError } from "@/components/error-boundary";
import { ScreenHeader } from "@/components/ui/screen-header";

export default function NetworkLogsScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Network Logs" />
      <NetworkLogger theme="dark" />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

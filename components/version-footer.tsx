import * as Application from "expo-application";
import Constants from "expo-constants";
import { View } from "react-native";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { Text } from "@/components/ui/text";

function VersionFooterInner() {
  const version =
    Constants.expoConfig?.version ?? Application.nativeApplicationVersion;

  return (
    <View className="mx-auto mt-4 self-center px-6 py-3">
      <Text className="text-xs text-muted-foreground">Version {version}</Text>
    </View>
  );
}

export function VersionFooter() {
  return (
    <ComponentErrorBoundary name="VersionFooter">
      <VersionFooterInner />
    </ComponentErrorBoundary>
  );
}

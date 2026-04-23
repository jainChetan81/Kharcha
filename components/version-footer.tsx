import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef } from "react";
import { Pressable } from "react-native";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { Text } from "@/components/ui/text";
import { SCREENS } from "@/lib/constants";

const TAP_WINDOW_MS = 3000;
const TAPS_REQUIRED = 5;

function VersionFooterInner() {
  const tapsRef = useRef<number[]>([]);

  const version =
    Constants.expoConfig?.version ?? Application.nativeApplicationVersion;

  const handlePress = () => {
    const now = Date.now();
    const recent = tapsRef.current.filter((t) => now - t < TAP_WINDOW_MS);
    recent.push(now);
    tapsRef.current = recent;

    if (recent.length > 1) {
      Haptics.selectionAsync();
    }

    if (recent.length >= TAPS_REQUIRED) {
      tapsRef.current = [];
      router.push(SCREENS.NETWORK_LOGS);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className="mx-auto mt-4 self-center px-6 py-3"
    >
      <Text className="text-xs text-muted-foreground">Version {version}</Text>
    </Pressable>
  );
}

export function VersionFooter() {
  return (
    <ComponentErrorBoundary name="VersionFooter">
      <VersionFooterInner />
    </ComponentErrorBoundary>
  );
}

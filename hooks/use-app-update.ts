import * as Updates from "expo-updates";
import { useState } from "react";
import { Alert } from "react-native";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

// `Updates.channel` is empty when the build wasn't made by EAS with a
// channel set in eas.json — e.g. `expo run:ios`, a local Xcode build, or
// an EAS build before the channel keys were added. Without a channel, the
// EAS Update server returns 400 "channel-name: Required", which is noise
// the user can't act on. Detect this state up front and show actionable
// copy instead.
function isOtaConfigured(): boolean {
  return Updates.isEnabled && Boolean(Updates.channel);
}

// Surfaced so the profile screen can hide the "Check for Updates" row
// entirely when OTA isn't going to work.
export function isAppUpdateSupported(): boolean {
  return isOtaConfigured();
}

export function useAppUpdate() {
  const [checking, setChecking] = useState(false);

  async function checkForUpdate() {
    if (!Updates.isEnabled) {
      showErrorToast("Updates unavailable", "Not supported in dev builds");
      return;
    }
    if (!Updates.channel) {
      // Build was made without an EAS channel — the request will 400 with
      // "channel-name: Required". Tell the user the actionable thing.
      showErrorToast(
        "OTA not configured in this build",
        "Install the latest version from the store.",
      );
      return;
    }
    if (checking) return;
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        showSuccessToast("You're up to date");
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        "Update ready",
        "Restart the app to apply the latest update.",
        [
          { text: "Later", style: "cancel" },
          { text: "Restart", onPress: () => void Updates.reloadAsync() },
        ],
      );
    } catch (err) {
      // Re-detect the channel-missing case in case the runtime cleared
      // Updates.channel after we checked. Same actionable message.
      const msg = String(err);
      if (msg.includes("channel-name") || msg.includes("missing-headers")) {
        showErrorToast(
          "OTA not configured in this build",
          "Install the latest version from the store.",
        );
        return;
      }
      showErrorToast("Update check failed", err);
    } finally {
      setChecking(false);
    }
  }

  return { checking, checkForUpdate };
}

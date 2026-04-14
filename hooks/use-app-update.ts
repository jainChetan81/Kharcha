import * as Updates from "expo-updates";
import { useState } from "react";
import { Alert } from "react-native";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function useAppUpdate() {
  const [checking, setChecking] = useState(false);

  async function checkForUpdate() {
    if (!Updates.isEnabled) {
      showErrorToast("Updates unavailable", "Not supported in dev builds");
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
      showErrorToast("Update check failed", err);
    } finally {
      setChecking(false);
    }
  }

  return { checking, checkForUpdate };
}

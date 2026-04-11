import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { showErrorToast } from "@/lib/toast";

async function promptBiometric(): Promise<boolean> {
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    showErrorToast("No biometrics set up on this device");
    return false;
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Kharcha",
    fallbackLabel: "Use Passcode",
  });
  return result.success;
}

export function useAppLock(dbReady: boolean) {
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasCheckedColdStart = useRef(false);
  // Guard against the AppState listener re-triggering authentication while a
  // biometric prompt is already on screen — the native prompt can push the
  // app through inactive → active on some devices, which would loop.
  const authInFlight = useRef(false);

  const authenticate = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    try {
      const success = await promptBiometric();
      if (success) {
        setLocked(false);
      }
    } finally {
      authInFlight.current = false;
    }
  }, []);

  // Cold-start check — gated on dbReady so we don't read config before
  // initDB has created the table.
  useEffect(() => {
    if (!dbReady || hasCheckedColdStart.current) return;
    hasCheckedColdStart.current = true;

    getConfig(CONFIG_KEYS.APP_LOCK_ENABLED)
      .then((value) => {
        if (value === "1") {
          setLocked(true);
          authenticate();
        }
      })
      .catch(() => {
        // Config read failed — don't block the app, leave unlocked.
      });
  }, [dbReady, authenticate]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          // Skip the re-auth trigger while a biometric prompt is still up.
          if (authInFlight.current) {
            appState.current = nextState;
            return;
          }
          getConfig(CONFIG_KEYS.APP_LOCK_ENABLED)
            .then((value) => {
              if (value === "1") {
                setLocked(true);
                authenticate();
              }
            })
            .catch(() => {});
        }
        appState.current = nextState;
      },
    );

    return () => subscription.remove();
  }, [authenticate]);

  return { locked, authenticate };
}

export function useAppLockSetting() {
  const queryClient = useQueryClient();

  const { data: value } = useQuery({
    queryKey: [QUERY_KEYS.CONFIG, CONFIG_KEYS.APP_LOCK_ENABLED],
    queryFn: () => getConfig(CONFIG_KEYS.APP_LOCK_ENABLED),
  });

  const mutation = useMutation({
    mutationFn: (newValue: string) =>
      updateConfig(CONFIG_KEYS.APP_LOCK_ENABLED, newValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONFIG] });
    },
  });

  const enabled = value === "1";

  async function toggle(): Promise<boolean> {
    // Check enrollment first so we can emit a single, specific toast when
    // biometrics aren't set up, instead of the generic "auth failed" one.
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      showErrorToast("No biometrics set up on this device");
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm with biometrics",
      fallbackLabel: "Use Passcode",
    });
    if (!result.success) {
      showErrorToast("Biometric auth failed");
      return false;
    }

    await mutation.mutateAsync(enabled ? "0" : "1");
    return true;
  }

  return { enabled, toggle };
}

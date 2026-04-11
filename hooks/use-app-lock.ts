import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { CONFIG_KEYS, QUERY_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { showErrorToast } from "@/lib/toast";

async function promptBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Kharcha",
    fallbackLabel: "Use Passcode",
  });
  return result.success;
}

export function useAppLock() {
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasCheckedColdStart = useRef(false);

  const authenticate = useCallback(async () => {
    const success = await promptBiometric();
    if (success) {
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    if (hasCheckedColdStart.current) return;
    hasCheckedColdStart.current = true;

    getConfig(CONFIG_KEYS.APP_LOCK_ENABLED).then((value) => {
      if (value === "1") {
        setLocked(true);
        authenticate();
      }
    });
  }, [authenticate]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          getConfig(CONFIG_KEYS.APP_LOCK_ENABLED).then((value) => {
            if (value === "1") {
              setLocked(true);
              authenticate();
            }
          });
        }
        appState.current = nextState;
      },
    );

    return () => subscription.remove();
  }, [authenticate]);

  return { locked, authenticate };
}

async function verifyBiometrics(): Promise<boolean> {
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    showErrorToast("No biometrics set up on this device");
    return false;
  }

  return promptBiometric();
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
    const verified = await verifyBiometrics();
    if (!verified) {
      showErrorToast("Biometric auth failed");
      return false;
    }

    await mutation.mutateAsync(enabled ? "0" : "1");
    return true;
  }

  return { enabled, toggle };
}

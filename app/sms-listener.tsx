import { Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StepCard } from "@/components/ui/step-card";
import { SwitchRow } from "@/components/ui/switch-row";
import { Text } from "@/components/ui/text";
import {
  useAutoRefreshPrefs,
  useSetAutoRefreshPref,
} from "@/hooks/use-auto-refresh-prefs";
import { useSmsListenerEnabled } from "@/hooks/use-feature-flags";
import {
  useOpenNotificationAccessSettings,
  useSmsListenerStatus,
} from "@/hooks/use-sms-listener";
import { SCREENS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { isAndroid } from "@/lib/utils";

export default function SmsListenerScreen() {
  const listenerFlag = useSmsListenerEnabled();
  const { data: status } = useSmsListenerStatus();
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const setAutoRefreshPref = useSetAutoRefreshPref();
  const openSettings = useOpenNotificationAccessSettings();

  if (!isAndroid) return <Redirect href={SCREENS.PROFILE} />;
  if (!listenerFlag) return <Redirect href={SCREENS.PROFILE} />;

  const granted = status?.granted ?? false;
  const listenerOn = autoRefreshPrefs?.sms_listener ?? false;
  const accessRevokedWithIntentOn = !granted && listenerOn;

  function handleGrantAccess() {
    logEvent(FIREBASE_EVENTS.SMS_LISTENER_GRANT_TAPPED);
    openSettings();
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="SMS Listener" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Automatically capture bank SMS as they arrive. No need to share each
          message — Kharcha will parse and save the transaction in the
          background. Works only for SMS from bank sender IDs.
        </Text>

        {!granted ? (
          <View className="mx-5 mb-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <Text className="text-sm font-semibold text-foreground">
              {accessRevokedWithIntentOn
                ? "Notification access was revoked"
                : "Notification access required"}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              {accessRevokedWithIntentOn
                ? "Re-grant access to resume capturing bank SMS — your toggle is still on."
                : "Grant notification access so Kharcha can read bank SMS alerts. You can revoke anytime from Android Settings."}
            </Text>
            <Button className="mt-3" onPress={handleGrantAccess}>
              <Text className="text-sm font-semibold text-primary-foreground">
                {accessRevokedWithIntentOn
                  ? "Re-grant Access"
                  : "Grant Notification Access"}
              </Text>
            </Button>
          </View>
        ) : null}

        <SectionHeader title="How it works" />
        <View className="mx-5 mb-2 flex-row gap-3">
          <StepCard
            step="1"
            title="Receive SMS"
            body="Your bank sends a transaction alert to your phone."
          />
          <StepCard
            step="2"
            title="Auto-parse"
            body="Kharcha reads the notification and extracts the amount."
          />
          <StepCard
            step="3"
            title="Saved"
            body="Transaction is added next time you open the app."
          />
        </View>

        <SectionHeader title="Settings" />
        <SwitchRow
          label="Enable SMS Listener"
          description={
            granted
              ? "Automatically capture bank SMS notifications."
              : "Grant notification access first."
          }
          value={listenerOn && granted}
          disabled={!granted}
          onValueChange={(next) =>
            setAutoRefreshPref.mutate({ key: "sms_listener", enabled: next })
          }
        />
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

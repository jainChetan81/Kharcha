import { Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StepCard } from "@/components/ui/step-card";
import { SwitchRow } from "@/components/ui/switch-row";
import { Text } from "@/components/ui/text";
import {
  useAutoRefreshPrefs,
  useSetAutoRefreshPref,
} from "@/hooks/use-auto-refresh-prefs";
import { SCREENS, SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { isAndroid } from "@/lib/utils";

export default function SmsSyncScreen() {
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const setAutoRefreshPref = useSetAutoRefreshPref();

  if (!isAndroid) return <Redirect href={SCREENS.PROFILE} />;

  const smsOn = autoRefreshPrefs?.sms ?? true;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="SMS Sync" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Forward bank SMS into Kharcha to turn them into transactions. Open any
          bank message in your SMS app, tap Share, and pick Kharcha — we'll
          parse the amount, merchant, and date for you to confirm.
        </Text>

        <SectionHeader title="How it works" />
        <View className="mx-5 mb-2 flex-row gap-3">
          <StepCard
            step="1"
            title="Open SMS"
            body="Open the bank message in your Messages app."
          />
          <StepCard
            step="2"
            title="Share"
            body="Tap the share button and pick Kharcha from the list."
          />
          <StepCard
            step="3"
            title="Confirm"
            body="Review the parsed transaction and save it."
          />
        </View>

        <SectionHeader title="Settings" />
        <SwitchRow
          label="Enable SMS Sync"
          description="Turn off to stop receiving shared SMS into Kharcha."
          value={smsOn}
          onValueChange={(next) =>
            setAutoRefreshPref.mutate({ key: "sms", enabled: next })
          }
        />
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

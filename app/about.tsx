import { format } from "date-fns";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { InfoRow } from "@/components/ui/info-row";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { useDataStats } from "@/hooks/use-stats";
import { parseDate } from "@/lib/format";

function getDeviceTypeName(type: Device.DeviceType | null): string {
  switch (type) {
    case Device.DeviceType.PHONE:
      return "Phone";
    case Device.DeviceType.TABLET:
      return "Tablet";
    case Device.DeviceType.DESKTOP:
      return "Desktop";
    case Device.DeviceType.TV:
      return "TV";
    default:
      return "Unknown";
  }
}

export default function AboutScreen() {
  const { data: stats } = useDataStats();

  const firstDate = stats?.first_transaction_date
    ? format(parseDate(stats.first_transaction_date), "dd MMM yyyy")
    : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="About" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <SectionHeader title="App" />
        <InfoRow
          label="App Version"
          value={
            Constants.expoConfig?.version ??
            Application.nativeApplicationVersion
          }
        />
        <InfoRow label="Build Number" value={Application.nativeBuildVersion} />
        <InfoRow label="Bundle ID" value={Application.applicationId} />

        <SectionHeader title="Device" />
        <InfoRow label="Device" value={Device.modelName} />
        <InfoRow
          label="OS Version"
          value={`${Device.osName} ${Device.osVersion}`}
        />
        <InfoRow
          label="Device Type"
          value={getDeviceTypeName(Device.deviceType)}
        />

        <SectionHeader title="Data" />
        <InfoRow
          label="Total Transactions"
          value={String(stats?.total_transactions ?? 0)}
        />
        <InfoRow
          label="Total Categories"
          value={String(stats?.total_categories ?? 0)}
        />
        <InfoRow
          label="Total Sources"
          value={String(stats?.total_sources ?? 0)}
        />
        <InfoRow label="Data Since" value={firstDate} />
      </ScrollView>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

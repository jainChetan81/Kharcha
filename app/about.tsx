import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getDataStats } from "@/lib/db";
import { parseDate } from "@/lib/format";
import { cn, isIOS } from "@/lib/utils";

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </Text>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <Text className="text-sm text-muted-foreground">{value ?? "—"}</Text>
    </View>
  );
}

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
  const { data: stats } = useQuery({
    queryKey: ["data-stats"],
    queryFn: getDataStats,
  });

  const firstDate = stats?.first_transaction_date
    ? format(parseDate(stats.first_transaction_date), "dd MMM yyyy")
    : null;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable onPress={() => router.back()} className="mr-3 py-1">
          <Icon as={ChevronLeft} className="size-6 text-foreground" />
        </Pressable>
        <Text className="text-lg font-bold text-foreground">About</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* App */}
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

        {/* Device */}
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

        {/* Data */}
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

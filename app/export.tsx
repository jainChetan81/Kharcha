import { FileText } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { Pressable, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";

const ExportSheet = lazy(() =>
  import("@/components/export-sheet").then((m) => ({
    default: m.ExportSheet,
  })),
);

export default function ExportScreen() {
  const [showExport, setShowExport] = useState(false);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Export" />

      <Text className="mb-2 mt-2 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Export
      </Text>

      <Pressable
        onPress={() => setShowExport(true)}
        className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
      >
        <Icon as={FileText} className="mr-3 size-4 text-muted-foreground" />
        <Text className="flex-1 text-sm font-medium text-foreground">
          Export as CSV
        </Text>
      </Pressable>

      <Suspense fallback={null}>
        <ExportSheet
          visible={showExport}
          onClose={() => setShowExport(false)}
        />
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

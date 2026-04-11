import { router } from "expo-router";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { Text } from "@/components/ui/text";
import { SCREENS } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

type SyncStat = {
  label: string;
  count: number;
  color: string;
};

export function SyncResultsSheet({
  visible,
  onClose,
  title = "Sync Results",
  subtitle,
  emptyMessage = "Already up to date",
  stats,
  showViewButton = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  stats: SyncStat[];
  showViewButton?: boolean;
  children?: React.ReactNode;
}) {
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  const isEmpty = total === 0 && !children;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="rounded-t-2xl bg-card px-5 pb-6 pt-5">
        <ComponentErrorBoundary onDismiss={onClose}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-bold text-foreground">{title}</Text>
            {subtitle && (
              <Text className="text-xs text-muted-foreground">{subtitle}</Text>
            )}
          </View>

          {isEmpty ? (
            <Text className="py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Text>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 400 }}
            >
              {children}

              {stats.map(
                (stat) =>
                  stat.count > 0 && (
                    <View
                      key={stat.label}
                      className="mb-2 flex-row items-center gap-2 rounded-xl bg-background px-4 py-3"
                    >
                      <View
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: stat.color }}
                      />
                      <Text className="flex-1 text-sm font-semibold text-foreground">
                        {stat.label}
                      </Text>
                      <View className="rounded-full bg-muted px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-muted-foreground">
                          {stat.count}
                        </Text>
                      </View>
                    </View>
                  ),
              )}
            </ScrollView>
          )}

          <View className={cn("mt-4 flex-row gap-3", isIOS && "mb-4")}>
            {showViewButton && (
              <Pressable
                onPress={() => {
                  onClose();
                  router.push(`${SCREENS.HISTORY}?source_type=synced`);
                }}
                className="flex-1 items-center rounded-xl border border-border py-3"
              >
                <Text className="text-sm font-semibold text-foreground">
                  View
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-xl bg-primary py-3"
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                Done
              </Text>
            </Pressable>
          </View>
        </ComponentErrorBoundary>
      </View>
    </Modal>
  );
}

import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { TagStatus } from "@/lib/tag-status";
import { cn } from "@/lib/utils";

export function TagStatusBadge({ status }: { status: TagStatus }) {
  const isActive = status.tone === "active";
  return (
    <View
      className={cn(
        "rounded-full px-2 py-0.5",
        isActive ? "bg-primary/20" : "bg-muted",
      )}
    >
      <Text
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        {status.label}
      </Text>
    </View>
  );
}

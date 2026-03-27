import { format } from "date-fns";
import { Trash2 } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { TransactionRow } from "@/lib/db";
import { formatINR, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TransactionItem({
  item,
  showTime = false,
  onDelete,
  isDeleting = false,
}: {
  item: TransactionRow;
  showTime?: boolean;
  onDelete?: (id: number) => void;
  isDeleting?: boolean;
}) {
  const isIncome = item.type === "income";
  const subtitle = isIncome
    ? (item.category_name ?? "uncategorized")
    : `${item.category_name ?? "uncategorized"}${item.source_name ? ` · ${item.source_name}` : ""}`;

  return (
    <View className="mb-2 flex-row items-stretch gap-2">
      <View className="flex-[4] flex-row items-center rounded-2xl border border-border bg-card p-4">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <Text className="text-sm font-semibold text-muted-foreground">
            {(item.merchant ?? item.category_name ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-semibold text-foreground">
            {item.merchant || item.category_name || item.type}
          </Text>
          <Text className="mt-0.5 text-xs capitalize text-muted-foreground">
            {subtitle}
          </Text>
        </View>
        <View className="items-end">
          <Text
            className={cn(
              "text-sm font-bold",
              isIncome ? "text-positive" : "text-negative",
            )}
          >
            {isIncome ? "+" : "-"}
            {formatINR(item.amount)}
          </Text>
          {showTime && (
            <Text className="mt-0.5 text-[10px] text-muted-foreground">
              {format(parseDate(item.date), "hh:mm a")}
            </Text>
          )}
        </View>
      </View>
      {onDelete && (
        <Pressable
          onPress={() => !isDeleting && onDelete(item.id)}
          className={cn(
            "w-14 items-center justify-center rounded-2xl bg-negative",
            isDeleting && "opacity-50",
          )}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon as={Trash2} className="size-5 text-white" />
          )}
        </Pressable>
      )}
    </View>
  );
}

export function DateHeader({ label }: { label: string }) {
  return (
    <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </Text>
  );
}

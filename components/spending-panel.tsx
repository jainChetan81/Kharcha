import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { RadarChart } from "react-native-gifted-charts";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StackedBar } from "@/components/ui/stacked-bar";
import { Text } from "@/components/ui/text";
import { useTagBreakdown } from "@/hooks/use-tags";
import {
  useCategoryBreakdown,
  useMerchantBreakdown,
} from "@/hooks/use-transactions";
import {
  CATEGORY_PALETTE,
  COLORS,
  TOP_BREAKDOWN_LIMIT,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import type {
  CategoryBreakdownRow,
  MerchantBreakdownRow,
  TagBreakdownRow,
} from "@/lib/db/types";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { historyHref } from "@/lib/format";

type Lens = "category" | "tag" | "merchant";

const LENS_EMPTY_NOUN: Record<Lens, string> = {
  category: "categories",
  tag: "tags",
  merchant: "merchants",
};

type Row = {
  key: string;
  label: string;
  total: number;
  count: number;
  percentage: number;
  href: string;
};

const LENS_OPTIONS: { value: Lens; label: string }[] = [
  { value: "category", label: "Categories" },
  { value: "tag", label: "Tags" },
  { value: "merchant", label: "Merchants" },
];

export function SpendingPanel({
  selectedMonth,
  fmt,
}: {
  selectedMonth: string;
  fmt: (n: number) => string;
}) {
  const [lens, setLens] = useState<Lens>("category");

  const { data: categories = [] } = useCategoryBreakdown(selectedMonth);
  const { data: tags = [] } = useTagBreakdown(selectedMonth);
  const { data: merchants = [] } = useMerchantBreakdown(selectedMonth);

  function handleLensChange(next: Lens) {
    logEvent(FIREBASE_EVENTS.SPENDING_LENS_CHANGED, { lens: next });
    setLens(next);
  }

  const rows = useMemo(
    () => toRows(lens, categories, tags, merchants, selectedMonth),
    [lens, categories, tags, merchants, selectedMonth],
  );
  const totalGroups = rows.length;
  const top = rows.slice(0, TOP_BREAKDOWN_LIMIT);
  const monthTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const hasAnyBreakdown =
    categories.length > 0 || tags.length > 0 || merchants.length > 0;
  if (!hasAnyBreakdown) return null;

  return (
    <View className="px-5 pb-2 pt-4">
      <View className="mb-3 flex-row items-end justify-between">
        <Text className="text-lg font-semibold text-foreground">
          Where it went
        </Text>
        {totalGroups > 0 && (
          <Text className="text-xs text-muted-foreground">
            top {top.length} of {totalGroups}
          </Text>
        )}
      </View>

      <View className="mb-4">
        <SegmentedControl
          options={LENS_OPTIONS}
          value={lens}
          onChange={handleLensChange}
        />
      </View>

      {top.length === 0 ? (
        <View className="py-6">
          <Text className="text-center text-sm text-muted-foreground">
            No {LENS_EMPTY_NOUN[lens]} to show for this month
          </Text>
        </View>
      ) : (
        <>
          {lens === "category" && top.length >= 3 ? (
            <View className="mb-4 items-center">
              <RadarChart
                data={top.map((r) => r.total)}
                labels={top.map((r) =>
                  r.label.length > 12 ? `${r.label.slice(0, 11)}…` : r.label,
                )}
                chartSize={240}
                noOfSections={4}
                maxValue={Math.max(...top.map((r) => r.total)) * 1.15}
                circular
                hideAsterLines
                polygonConfig={{
                  fill: COLORS.PRIMARY,
                  opacity: 0.3,
                  stroke: COLORS.PRIMARY,
                  strokeWidth: 2,
                  showGradient: false,
                }}
                gridConfig={{
                  fill: "transparent",
                  stroke: COLORS.BAR_BG,
                  strokeWidth: 0.5,
                  showGradient: false,
                  gradientColor: COLORS.BACKGROUND,
                  opacity: 1,
                }}
                labelConfig={{
                  fontSize: 11,
                  stroke: COLORS.MUTED,
                }}
              />
            </View>
          ) : (
            <View className="mb-4">
              <StackedBar
                segments={top.map((row, i) => ({
                  value: row.total,
                  color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                }))}
                total={monthTotal}
              />
            </View>
          )}

          <View>
            {top.map((row, i) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                onPress={() => router.push(row.href)}
                className="-mx-3 flex-row items-center rounded-xl px-3 py-2.5"
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? "rgba(150, 150, 150, 0.1)"
                    : "transparent",
                })}
              >
                <Text className="w-5 text-sm text-muted-foreground">
                  {i + 1}
                </Text>
                <View
                  className="mr-3 size-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                  }}
                />
                <Text
                  className="flex-1 text-base text-foreground"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                <Text className="mr-3 text-xs text-muted-foreground">
                  {row.count} tx
                </Text>
                <Text className="mr-3 w-10 text-right text-xs text-muted-foreground">
                  {Math.round(row.percentage)}%
                </Text>
                <Text className="w-20 text-right text-base font-semibold text-foreground">
                  {fmt(row.total)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              logEvent(FIREBASE_EVENTS.SPENDING_VIEW_FULL_BREAKDOWN, { lens });
              router.push(
                historyHref({
                  type: TRANSACTION_TYPE.EXPENSE,
                  month: selectedMonth,
                  summary: true,
                }),
              );
            }}
            className="items-center pt-4"
          >
            <Text className="text-sm font-medium text-primary-text">
              View full breakdown →
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function toRows(
  lens: Lens,
  categories: CategoryBreakdownRow[],
  tags: TagBreakdownRow[],
  merchants: MerchantBreakdownRow[],
  selectedMonth: string,
): Row[] {
  if (lens === "category") {
    return categories.map((c) => ({
      key: `cat-${c.category_id ?? "other"}`,
      label: c.category_name,
      total: c.total,
      count: c.count,
      percentage: c.percentage,
      href: historyHref({
        type: TRANSACTION_TYPE.EXPENSE,
        categoryId: c.category_id ?? "other",
        month: selectedMonth,
      }),
    }));
  }
  if (lens === "tag") {
    return tags.map((t) => ({
      key: `tag-${t.tag_id}`,
      label: `#${t.tag_name}`,
      total: t.total,
      count: t.count,
      percentage: t.percentage,
      href: historyHref({
        type: TRANSACTION_TYPE.EXPENSE,
        tagId: t.tag_id,
        month: selectedMonth,
      }),
    }));
  }
  return merchants.map((m) => ({
    key: `m-${m.merchant}`,
    label: m.merchant,
    total: m.total,
    count: m.count,
    percentage: m.percentage,
    href: historyHref({
      type: TRANSACTION_TYPE.EXPENSE,
      merchant: m.merchant,
      month: selectedMonth,
    }),
  }));
}

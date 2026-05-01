import {
  endOfMonth,
  format,
  getDay,
  getDaysInMonth,
  parse,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDailySpend } from "@/hooks/use-stats";
import { DATE_ISO_FORMAT } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Empty cells use bg-muted (#2a2a2a) so they stay visible as a subtle grid
// against the card background (#1a1a1a). bg-card matches the surrounding
// card and would make zero-spend days disappear into the background.
const BUCKET_BG = [
  "bg-muted",
  "bg-primary/35",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
] as const;

type CellSlot =
  | { type: "pad" }
  | { type: "day"; bucket: 0 | 1 | 2 | 3 | 4; isToday?: boolean };

type SpendingHeatmapProps = {
  /** Month to render in `YYYY-MM` form. */
  yearMonth: string;
  /**
   * Row height in px. Cells stretch to fill the container width (so the grid
   * is always edge-to-edge); height stays fixed so the grid is short and
   * dense like GitHub's contribution graph. Default 12.
   */
  cellHeight?: number;
  /** Gap (in px) between cells. Default 2. */
  cellGap?: number;
  /**
   * The user's "today" as `YYYY-MM-DD`. Days strictly after this render as
   * blank padding (so the future half of the current month doesn't show as
   * filled cells), and the matching day gets a subtle ring as a "you are
   * here" marker.
   */
  today?: string;
};

const COLS = 7;

export function SpendingHeatmap({
  yearMonth,
  cellHeight = 12,
  cellGap = 2,
  today,
}: SpendingHeatmapProps) {
  const monthStart = useMemo(
    () => parse(`${yearMonth}-01`, DATE_ISO_FORMAT, new Date()),
    [yearMonth],
  );
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const fromIso = format(startOfMonth(monthStart), DATE_ISO_FORMAT);
  const toIso = format(monthEnd, DATE_ISO_FORMAT);

  const { data: rows = [] } = useDailySpend(fromIso, toIso);

  const slots = useMemo<CellSlot[]>(() => {
    const dayMap = new Map(rows.map((r) => [r.date, r.total]));
    const daysInMonth = getDaysInMonth(monthStart);

    // Linear bucket scale within this month's actual spend range. Lowest
    // non-zero day → bucket 1, highest → bucket 4. Empty days → bucket 0.
    const nonZero = rows.map((r) => r.total).filter((t) => t > 0);
    const min = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    const max = nonZero.length > 0 ? Math.max(...nonZero) : 0;
    const range = max - min;
    const bucketFor = (amount: number): 0 | 1 | 2 | 3 | 4 => {
      if (amount <= 0) return 0;
      if (range <= 0) return 4;
      const pct = (amount - min) / range;
      if (pct >= 0.75) return 4;
      if (pct >= 0.5) return 3;
      if (pct >= 0.25) return 2;
      return 1;
    };

    // Mon=0..Sun=6 offset for the 1st of the month. JS getDay() is Sun=0,
    // shift so Monday-start grids align.
    const startDow = (getDay(monthStart) + 6) % 7;

    const cells: CellSlot[] = [];

    // Leading padding so day 1 lands on its weekday.
    for (let i = 0; i < startDow; i++) cells.push({ type: "pad" });

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${yearMonth}-${String(d).padStart(2, "0")}`;
      // All days in the month render as visible cells so the calendar
      // structure is always readable. Days without spend (past or future)
      // naturally fall into bucket 0 (bg-muted) since they aren't in the
      // dayMap. The matching `today` day gets a ring on top.
      cells.push({
        type: "day",
        bucket: bucketFor(dayMap.get(iso) ?? 0),
        isToday: iso === today,
      });
    }

    // Trailing padding to fill the last row.
    while (cells.length % COLS !== 0) cells.push({ type: "pad" });

    return cells;
  }, [rows, monthStart, yearMonth, today]);

  // Group cells into rows of 7 so each row can use `flex: 1` per cell to
  // stretch edge-to-edge. Cells become wider than tall on a phone — that's
  // intentional. With only 7 columns, square + full-width = giant cells, so
  // we keep height fixed and let width fill. Reads as a dense GitHub-style
  // strip for the month.
  const gridRows: CellSlot[][] = [];
  for (let i = 0; i < slots.length; i += COLS) {
    gridRows.push(slots.slice(i, i + COLS));
  }

  return (
    <View style={{ rowGap: cellGap }}>
      {gridRows.map((row, ri) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: positional grid, not a list
          key={ri}
          style={{ flexDirection: "row", columnGap: cellGap }}
        >
          {row.map((slot, ci) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: positional grid
              key={ci}
              style={{ flex: 1, height: cellHeight }}
              className={cn(
                "rounded-sm",
                slot.type === "pad" ? "bg-transparent" : BUCKET_BG[slot.bucket],
                slot.type === "day" && slot.isToday && "border border-primary",
              )}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function SpendingHeatmapLegend() {
  // Skip BUCKET_BG[0] — that bucket is "no spend" (an empty grid cell), not
  // part of the low → high spend gradient.
  const spendBuckets = BUCKET_BG.slice(1);
  return (
    <View className="mt-3 flex-row items-center gap-2">
      <Text className="text-[10px] text-muted-foreground">less</Text>
      {spendBuckets.map((c) => (
        <View key={c} className={cn("h-2.5 w-2.5 rounded-sm", c)} />
      ))}
      <Text className="text-[10px] text-muted-foreground">more</Text>
    </View>
  );
}

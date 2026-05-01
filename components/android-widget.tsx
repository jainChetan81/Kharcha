// Disable React Compiler memoization for this file — react-native-android-widget
// calls the exported widget components directly as raw render functions (no React
// runtime inside the widget host), so the compiler's memo wrapper trips the hook
// invariant with "Invalid Hook Call detected in SmallSpendWidget".
"use no memo";

import { FlexWidget, TextWidget } from "react-native-android-widget";
import { CATEGORY_PALETTE, COLORS, TAG_DISPLAY_LIMIT } from "@/lib/constants";

const BG = COLORS.BACKGROUND;
const FG = COLORS.FOREGROUND;
const MUTED = COLORS.MUTED;
const PRIMARY = COLORS.PRIMARY;
const BAR_BG = COLORS.BAR_BG;
const DANGER = COLORS.DANGER;
const POSITIVE = COLORS.POSITIVE;

export type AndroidWidgetData = {
  totalExpenses: number;
  currencySymbol: string;
  monthLabel: string;
  categories: Array<{ name: string; amount: number; percentage: number }>;
  projectedLow: number | null;
  projectedHigh: number | null;
  daysElapsed: number;
  daysInMonth: number;
  todaySpend: number;
  totalBudget: number | null;
  previousMonthSpendAtThisPoint: number | null;
  activeTagName: string | null;
};

function formatAmount(amount: number, symbol: string): string {
  if (amount >= 100_000) {
    return `${symbol}${(amount / 100_000).toFixed(1)}L`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    if (k === Math.floor(k)) {
      return `${symbol}${Math.floor(k)}k`;
    }
    return `${symbol}${k.toFixed(1)}k`;
  }
  return `${symbol}${Math.floor(amount)}`;
}

function EmptyWidget() {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: BG,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 16,
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text="kharcha"
        style={{ fontSize: 14, fontWeight: "bold", color: PRIMARY }}
      />
      <TextWidget
        text="Open app to get started"
        style={{ fontSize: 11, color: MUTED, marginTop: 4 }}
      />
    </FlexWidget>
  );
}

export function SmallSpendWidget(props: { data: AndroidWidgetData | null }) {
  if (!props.data) return <EmptyWidget />;
  const { data } = props;

  const daysPct = Math.min(
    Math.round((data.daysElapsed / data.daysInMonth) * 100),
    100,
  );
  const daysFilled = Math.max(daysPct, 1);
  const daysEmpty = Math.max(100 - daysPct, 0);

  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: BG,
        flexDirection: "column",
        justifyContent: "center",
        padding: 14,
        borderRadius: 16,
        flexGap: 6,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text={data.monthLabel}
        style={{ fontSize: 14, color: MUTED }}
      />

      <TextWidget
        text={formatAmount(data.totalExpenses, data.currencySymbol)}
        style={{ fontSize: 28, fontWeight: "bold", color: FG, marginTop: 2 }}
      />

      {data.activeTagName ? (
        <TextWidget
          text={`in #${data.activeTagName}`}
          style={{ fontSize: 11, color: PRIMARY, marginTop: 2 }}
          maxLines={1}
        />
      ) : null}

      {/* Days progress bar */}
      <FlexWidget
        style={{
          flexDirection: "row",
          width: "match_parent",
          height: 4,
          borderRadius: 2,
          backgroundColor: BAR_BG,
          marginTop: 2,
        }}
      >
        <FlexWidget
          style={{
            flex: daysFilled,
            height: 4,
            backgroundColor: PRIMARY,
            borderRadius: 2,
          }}
        />
        <FlexWidget style={{ flex: daysEmpty, height: 4 }} />
      </FlexWidget>
      <TextWidget
        text={`day ${data.daysElapsed} of ${data.daysInMonth}`}
        style={{ fontSize: 13, color: MUTED }}
      />

      <FlexWidget
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          width: "match_parent",
          marginTop: 8,
        }}
      >
        <TextWidget text="today" style={{ fontSize: 14, color: MUTED }} />
        <TextWidget
          text={formatAmount(data.todaySpend, data.currencySymbol)}
          style={{ fontSize: 16, fontWeight: "600", color: FG }}
        />
      </FlexWidget>

      {data.projectedLow != null && data.projectedHigh != null ? (
        <FlexWidget
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            width: "match_parent",
            marginTop: 4,
          }}
        >
          <TextWidget text="proj" style={{ fontSize: 14, color: MUTED }} />
          <TextWidget
            text={`${formatAmount(data.projectedLow, data.currencySymbol)}–${formatAmount(data.projectedHigh, data.currencySymbol)}`}
            style={{ fontSize: 14, fontWeight: "600", color: FG }}
            maxLines={1}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

function CategoryBar(props: {
  name: string;
  amount: number;
  percentage: number;
  symbol: string;
  barColor: `#${string}`;
}) {
  const pct = Math.min(props.percentage, 100);
  const filledWeight = Math.max(pct, 1);
  const emptyWeight = Math.max(100 - pct, 0);

  return (
    <FlexWidget style={{ flexDirection: "column", width: "match_parent" }}>
      <FlexWidget
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          width: "match_parent",
        }}
      >
        <TextWidget
          text={props.name}
          style={{ fontSize: 14, color: MUTED }}
          maxLines={1}
        />
        <TextWidget
          text={formatAmount(props.amount, props.symbol)}
          style={{ fontSize: 14, fontWeight: "600", color: FG }}
        />
      </FlexWidget>
      <FlexWidget
        style={{
          flexDirection: "row",
          width: "match_parent",
          height: 6,
          borderRadius: 3,
          marginTop: 4,
          backgroundColor: BAR_BG,
        }}
      >
        <FlexWidget
          style={{
            flex: filledWeight,
            height: 6,
            backgroundColor: props.barColor,
            borderRadius: 3,
          }}
        />
        <FlexWidget style={{ flex: emptyWeight, height: 6 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function MediumSpendWidget(props: { data: AndroidWidgetData | null }) {
  if (!props.data) return <EmptyWidget />;
  const { data } = props;

  const hasComparison =
    data.previousMonthSpendAtThisPoint != null &&
    data.previousMonthSpendAtThisPoint > 0;
  const isUp = hasComparison
    ? data.totalExpenses > (data.previousMonthSpendAtThisPoint ?? 0)
    : false;

  const topCategories = data.categories.slice(0, TAG_DISPLAY_LIMIT);

  const hasProjection = data.projectedLow != null && data.projectedHigh != null;
  const hasBudget = data.totalBudget != null && data.totalBudget > 0;
  const spendPct = hasBudget
    ? Math.min(
        Math.round((data.totalExpenses / (data.totalBudget ?? 1)) * 100),
        100,
      )
    : null;
  const spendFilled = Math.max(spendPct ?? 0, 1);
  const spendEmpty = Math.max(100 - (spendPct ?? 0), 0);
  const overBudget = hasBudget && data.totalExpenses > (data.totalBudget ?? 0);

  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: BG,
        flexDirection: "column",
        padding: 14,
        borderRadius: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Top: two columns */}
      <FlexWidget
        style={{
          flex: 1,
          width: "match_parent",
          flexDirection: "row",
        }}
      >
        {/* Left: totals */}
        <FlexWidget
          style={{
            flex: 1,
            height: "match_parent",
            flexDirection: "column",
            justifyContent: "center",
            paddingRight: 12,
            flexGap: 4,
          }}
        >
          <FlexWidget
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexGap: 6,
            }}
          >
            <TextWidget
              text={data.monthLabel}
              style={{ fontSize: 15, color: MUTED }}
            />
            {data.activeTagName ? (
              <TextWidget
                text={`· #${data.activeTagName}`}
                style={{ fontSize: 11, color: PRIMARY }}
                maxLines={1}
              />
            ) : null}
          </FlexWidget>

          <FlexWidget
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              flexGap: 4,
              marginTop: 4,
            }}
          >
            <TextWidget
              text={formatAmount(data.totalExpenses, data.currencySymbol)}
              style={{ fontSize: 32, fontWeight: "bold", color: FG }}
            />
            {hasComparison ? (
              <TextWidget
                text={isUp ? "↑" : "↓"}
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: isUp ? DANGER : POSITIVE,
                  marginBottom: 5,
                }}
              />
            ) : null}
          </FlexWidget>

          <TextWidget
            text={`today:  ${formatAmount(data.todaySpend, data.currencySymbol)}`}
            style={{ fontSize: 15, color: MUTED, marginTop: 8 }}
          />
        </FlexWidget>

        {/* Right: categories */}
        <FlexWidget
          style={{
            flex: 1,
            height: "match_parent",
            flexDirection: "column",
            justifyContent: "center",
            flexGap: 12,
          }}
        >
          {topCategories.map((cat, i) => (
            <CategoryBar
              key={cat.name}
              name={cat.name}
              amount={cat.amount}
              percentage={cat.percentage}
              symbol={data.currencySymbol}
              barColor={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
            />
          ))}
        </FlexWidget>
      </FlexWidget>

      {/* Bottom: projected spending */}
      {hasProjection ? (
        <FlexWidget
          style={{
            width: "match_parent",
            backgroundColor: overBudget
              ? "rgba(239, 68, 68, 0.12)"
              : "rgba(34, 197, 94, 0.12)",
            borderRadius: 10,
            borderWidth: 0.5,
            borderColor: overBudget
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(34, 197, 94, 0.2)",
            padding: 10,
            marginTop: 10,
            flexDirection: "column",
            flexGap: 6,
          }}
        >
          <FlexWidget
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "match_parent",
            }}
          >
            <TextWidget
              text="Projected spending"
              style={{ fontSize: 12, fontWeight: "600", color: FG }}
            />
            <TextWidget
              text={`${data.daysInMonth - data.daysElapsed} days left`}
              style={{ fontSize: 11, color: MUTED }}
            />
          </FlexWidget>

          <TextWidget
            text={`${formatAmount(data.projectedLow ?? 0, data.currencySymbol)} – ${formatAmount(data.projectedHigh ?? 0, data.currencySymbol)}`}
            style={{
              fontSize: 15,
              fontWeight: "bold",
              color: overBudget ? DANGER : POSITIVE,
            }}
          />

          {hasBudget ? (
            <FlexWidget
              style={{
                flexDirection: "column",
                flexGap: 4,
                width: "match_parent",
              }}
            >
              <FlexWidget
                style={{
                  flexDirection: "row",
                  width: "match_parent",
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: BAR_BG,
                }}
              >
                <FlexWidget
                  style={{
                    flex: spendFilled,
                    height: 5,
                    backgroundColor: overBudget ? DANGER : POSITIVE,
                    borderRadius: 3,
                  }}
                />
                <FlexWidget style={{ flex: spendEmpty, height: 5 }} />
              </FlexWidget>
              <FlexWidget
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "match_parent",
                }}
              >
                <TextWidget
                  text={`${formatAmount(data.totalExpenses, data.currencySymbol)} spent`}
                  style={{ fontSize: 10, color: MUTED }}
                />
                <TextWidget
                  text={`${formatAmount(data.totalBudget ?? 0, data.currencySymbol)} budget`}
                  style={{ fontSize: 10, color: MUTED }}
                />
              </FlexWidget>
            </FlexWidget>
          ) : null}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

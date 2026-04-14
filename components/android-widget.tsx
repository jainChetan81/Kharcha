import { FlexWidget, TextWidget } from "react-native-android-widget";

const BG = "#0a0a0a";
const FG = "#f0f0f0";
const MUTED = "#888888";
const PRIMARY = "#7c3aed";
const BAR_BG = "#2a2a2a";
const DANGER = "#ef4444";
const POSITIVE = "#22c55e";

const CATEGORY_PALETTE: `#${string}`[] = [
  "#7c3aed",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
];

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

  const topCategories = data.categories.slice(0, 3);

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
          <TextWidget
            text={data.monthLabel}
            style={{ fontSize: 15, color: MUTED }}
          />

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
            backgroundColor: "#111111",
            borderRadius: 10,
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

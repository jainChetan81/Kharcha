// Month-over-month spending-change math, shared by the Home screen banner
// and the Insights/Wrap screen. Both consumers compare "this month" vs
// "last month" expenses and need the same sanity cap on the percentage —
// previously each hook hand-rolled its own copy, and the copies had
// already drifted (Home silently hid the badge above the cap; Insights
// showed direction-only instead, and only Insights handled an exact 0%
// change). One copy, one behavior, used by both.

// When the prior month had near-zero spending, the percentage delta
// explodes (e.g. ₹100 → ₹39k = 38900%) and becomes alarmist noise. Cap the
// absolute change we'll display as a number; beyond it, show direction
// only. Currency-agnostic — purely a sanity bound on the rendered number.
export const PERCENT_DISPLAY_CAP = 999;

// `"new"` = no prior data, current > 0. `"huge-up" | "huge-down"` = prior >
// 0 but the delta exceeds PERCENT_DISPLAY_CAP; direction is still
// meaningful even when the exact number isn't worth printing.
export type SpendingChange = number | "new" | "huge-up" | "huge-down" | null;

export function computeSpendingChange(
  current: number,
  previous: number,
): SpendingChange {
  const rawPct =
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  if (rawPct === null) return current > 0 ? "new" : null;
  if (Math.abs(rawPct) > PERCENT_DISPLAY_CAP) {
    return rawPct > 0 ? "huge-up" : "huge-down";
  }
  return rawPct;
}

export type SpendingChangeTone = "up" | "down" | "muted";

// Single source of truth for "is this change good, bad, or a wash" —
// including the exact-0% case, which the Home screen's hand-rolled copy
// used to miss and render in the "down"/positive color.
export function getSpendingChangeTone(
  change: SpendingChange,
): SpendingChangeTone {
  if (change === null || change === "new") return "muted";
  if (change === "huge-up") return "up";
  if (change === "huge-down") return "down";
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "muted";
}

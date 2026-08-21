export type AlertTone = "warn" | "positive" | "negative" | "info";

export const ALERT_TONE_TEXT = {
  warn: "text-amber-500",
  positive: "text-positive",
  negative: "text-negative-text",
  info: "text-primary-text",
} satisfies Record<AlertTone, string>;

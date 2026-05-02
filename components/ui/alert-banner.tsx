export type AlertTone = "warn" | "positive" | "negative" | "info";

export const ALERT_TONE_TEXT: Record<AlertTone, string> = {
  warn: "text-amber-500",
  positive: "text-positive",
  negative: "text-negative",
  info: "text-primary",
};

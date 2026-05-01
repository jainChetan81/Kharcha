import { addHours, endOfDay } from "date-fns";

export type DurationKey = "1h" | "4h" | "8h" | "today";

export const DURATION_OPTIONS: { value: DurationKey; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "8h", label: "8 hours" },
  { value: "today", label: "End of day" },
];

export const DURATION_OPTIONS_DETAILED: {
  value: DurationKey;
  label: string;
  sub: string;
}[] = [
  { value: "1h", label: "1 hour", sub: "Quick errand" },
  { value: "4h", label: "4 hours", sub: "An afternoon" },
  { value: "8h", label: "8 hours", sub: "A workday" },
  { value: "today", label: "Until end of day", sub: "Whatever's left" },
];

export function durationEnd(key: DurationKey, now: Date): Date {
  switch (key) {
    case "1h":
      return addHours(now, 1);
    case "4h":
      return addHours(now, 4);
    case "8h":
      return addHours(now, 8);
    case "today":
      return endOfDay(now);
  }
}

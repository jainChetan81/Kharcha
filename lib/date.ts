import {
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import {
  DATE_ISO_FORMAT,
  PERIOD_PRESET,
  type PeriodPresetType,
} from "@/lib/constants";

type PresetRange = { from: string; to: string };

export function getPresetRange(preset: PeriodPresetType): PresetRange {
  const now = new Date();
  const fmt = (d: Date) => format(d, DATE_ISO_FORMAT);
  switch (preset) {
    case PERIOD_PRESET.TODAY:
      return { from: fmt(now), to: fmt(now) };
    case PERIOD_PRESET.THIS_WEEK:
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(now) };
    case PERIOD_PRESET.LAST_7_DAYS:
      return { from: fmt(subDays(now, 7)), to: fmt(now) };
    case PERIOD_PRESET.THIS_MONTH:
      return { from: fmt(startOfMonth(now)), to: fmt(now) };
    case PERIOD_PRESET.LAST_MONTH: {
      const prev = subMonths(now, 1);
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) };
    }
    case PERIOD_PRESET.THIS_YEAR:
      return { from: fmt(startOfYear(now)), to: fmt(now) };
    default:
      return { from: fmt(now), to: fmt(now) };
  }
}

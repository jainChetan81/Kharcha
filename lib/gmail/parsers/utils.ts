import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT } from "@/lib/constants";

export interface ParsedTransaction {
  amount: number;
  merchant: string;
  date: string;
  type: "expense" | "income";
  category?: string;
  confidence?: "high" | "medium" | "low";
  is_subscription?: boolean;
  billing_day?: number | null;
}

export type Parser = (body: string) => ParsedTransaction | null;

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Current datetime as the standard fallback when no date can be extracted. */
export function fallbackNow(): string {
  return format(new Date(), DATE_TIME_FORMAT);
}

/**
 * Parse a date string from an Indian bank email/SMS alert.
 * Tries every common Indian banking date format before falling back to now().
 * Strips whitespace so SBI's "01Apr25" (no separators) works too.
 */
const INDIAN_DATE_FORMATS = [
  "ddMMMyy",
  "ddMMMyyyy",
  "dd-MM-yy",
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "dd-MMM-yy",
  "dd-MMM-yyyy",
  "dd MMM yyyy",
  "dd MMM, yyyy",
];

export function parseIndianDate(raw: string, rawTime?: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const timeStr = rawTime?.trim();

  // If a time component was provided separately, try the combined string first
  if (timeStr) {
    for (const fmt of INDIAN_DATE_FORMATS) {
      try {
        const d = parse(`${cleaned} ${timeStr}`, `${fmt} HH:mm:ss`, new Date());
        if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
      } catch {}
    }
  }

  for (const fmt of INDIAN_DATE_FORMATS) {
    try {
      const nospace = cleaned.replace(/\s+/g, "");
      const d = fmt.includes(" ")
        ? parse(cleaned, fmt, new Date())
        : parse(nospace, fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return fallbackNow();
}

// Keep these for backward compat with the existing Axis / HDFC parsers that
// pass a separate time argument in a bank-specific format.
export function parseAxisDate(rawDate: string, rawTime?: string): string {
  return parseIndianDate(rawDate, rawTime);
}

export function parseHdfcDate(rawDate: string, rawTime?: string): string {
  return parseIndianDate(rawDate, rawTime);
}

export function parseAmount(str: string): number {
  return Number.parseFloat(str.replace(/,/g, ""));
}

/** Regex that extracts a date after "on" — covers dd/MM/yyyy, dd-MMM-yy, dd MMM yyyy etc. */
export const DATE_REGEX =
  /on\s+(\d{2}\s*\w{3}\s*\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i;

/** Regex that extracts a merchant name after at/towards. */
export const MERCHANT_REGEX =
  /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i;

export function tryParsers(
  parsers: Parser[],
  body: string,
): ParsedTransaction | null {
  for (const parser of parsers) {
    const result = parser(body);
    if (result) return result;
  }
  return null;
}

import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT } from "@/lib/constants";

export interface ParsedTransaction {
  amount: number;
  merchant: string;
  date: string;
  type: "expense" | "income";
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

export function parseAxisDate(rawDate: string, rawTime?: string): string {
  const time = rawTime ?? "00:00:00";
  const parsed = parse(`${rawDate} ${time}`, "dd-MM-yy HH:mm:ss", new Date());
  return format(parsed, DATE_TIME_FORMAT);
}

export function parseHdfcDate(rawDate: string, rawTime?: string): string {
  const time = rawTime ?? "00:00:00";
  const parsed = parse(
    `${rawDate} ${time}`,
    "dd MMM, yyyy HH:mm:ss",
    new Date(),
  );
  return format(parsed, DATE_TIME_FORMAT);
}

export function parseAmount(str: string): number {
  return Number.parseFloat(str.replace(/,/g, ""));
}

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

import type { Parser } from "./types";

export function parseAmount(str: string): number {
  return Number.parseFloat(str.replace(/,/g, ""));
}

/** Wrap a parser so non-transaction notices are never matched. */
export function withGuard(parser: Parser): Parser {
  return (text) => (isNonTransactionNotice(text) ? null : parser(text));
}

/**
 * True for messages that must never be parsed as completed transactions by
 * the local regex fast-path. Mirrors the mini pipeline's per-bank guards
 * (2026-07-17 audit): OTPs, statements, payment-due reminders, upcoming
 * AutoPay / e-mandate pre-debit notices, declined alerts, credit-card
 * bill-payment confirmations (self-transfers, not income), and
 * foreign-currency spends — the last so the AI path (which is
 * currency-aware) handles them instead of storing a USD number as INR.
 */
export function isNonTransactionNotice(text: string): boolean {
  if (/\bOTP\b|\bUPI\s+PIN\b|has\s+been\s+declined/i.test(text)) return true;
  if (
    /statement\s+(?:generated|for\s+your)|total\s+due|min\.?\s*due|amount\s+due|is\s+(?:over)?due|reminder!/i.test(
      text,
    )
  )
    return true;
  if (
    /(?:e-?mandate|upcoming\s+(?:mandate|debit|payment|transaction|AutoPay)|will\s+be\s+(?:debited|charged|auto-?debited)|to\s+be\s+debited\s+by|scheduled\s+(?:for|on)|shall\s+be\s+debited|auto\s*pay\s*activation)/i.test(
      text,
    ) &&
    !/(?:has\s+been|have\s+been|was|were)\s+(?:debited|charged)/i.test(text)
  ) {
    return true;
  }
  if (
    /payment\s+of\s+INR\s+[\d,.]+\s+has\s+been\s+received\s+towards\s+your\s+.*credit\s+card/i.test(
      text,
    )
  ) {
    return true;
  }
  // Foreign-currency spend: defer to the AI parse (currency-aware).
  if (/\b(?:USD|EUR|GBP|AED|SGD|AUD|CAD)\s*[\d,]+(?:\.\d+)?/.test(text))
    return true;
  return false;
}

export function parseAxisDate(rawDate: string): string {
  const [day, month, year] = rawDate.split("-");
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day}`;
}

export function parseHdfcDate(rawDate: string): string {
  // Looked up by a runtime month token from the parsed date, so the string
  // index signature must survive (named owner contract instead of Record).
  interface MonthTable {
    [month: string]: string;
  }
  const months: MonthTable = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const match = rawDate.match(/(\d{2})\s+(\w{3}),?\s+(\d{4})/);
  if (!match) return today();
  const [, day, mon, year] = match;
  return `${year}-${months[mon.toLowerCase()] ?? "01"}-${day}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

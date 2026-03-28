import { format, isToday, isYesterday } from "date-fns";
import type { TransactionRow } from "@/lib/db";

export type CurrencyCode = "INR" | "USD" | "GBP" | "EUR";

const CURRENCY_CONFIG: Record<
  CurrencyCode,
  { symbol: string; locale: string }
> = {
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  EUR: { symbol: "€", locale: "de-DE" },
};

export function formatCurrency(n: number, code: CurrencyCode = "INR") {
  const { symbol, locale } = CURRENCY_CONFIG[code];
  return `${symbol}${n.toLocaleString(locale)}`;
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(" ", "T"));
}

export function getDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "dd MMM yyyy");
}

export type ListItem =
  | { type: "header"; label: string }
  | { type: "transaction"; data: TransactionRow };

export function buildListData(transactions: TransactionRow[]): ListItem[] {
  const items: ListItem[] = [];
  let lastLabel = "";
  for (const t of transactions) {
    const label = getDateLabel(t.date);
    if (label !== lastLabel) {
      items.push({ type: "header", label });
      lastLabel = label;
    }
    items.push({ type: "transaction", data: t });
  }
  return items;
}

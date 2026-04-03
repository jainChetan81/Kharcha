import { format, isToday, isYesterday } from "date-fns";
import { DATE_FORMAT } from "@/lib/constants";
import type { TransactionRow } from "@/lib/db";

export type CurrencyCode = "INR" | "USD" | "GBP" | "EUR";

export const CURRENCIES: Record<
  CurrencyCode,
  { symbol: string; name: string; locale: string }
> = {
  INR: { symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
  USD: { symbol: "$", name: "US Dollar", locale: "en-US" },
  GBP: { symbol: "£", name: "British Pound", locale: "en-GB" },
  EUR: { symbol: "€", name: "Euro", locale: "de-DE" },
};

export function formatCurrency(n: number, code: CurrencyCode = "INR") {
  const { symbol, locale } = CURRENCIES[code];
  return `${symbol}${n.toLocaleString(locale)}`;
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(" ", "T"));
}

export function getDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, DATE_FORMAT);
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

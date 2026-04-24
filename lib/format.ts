import { format, isToday, isYesterday } from "date-fns";
import {
  DATE_FORMAT,
  SCREENS,
  type TransactionFilterType,
} from "@/lib/constants";
import type { TransactionRow } from "@/lib/db";

export type HistoryHrefParams = {
  type?: TransactionFilterType;
  categoryId?: number | "other" | null;
  tagId?: number | null;
  merchant?: string | null;
  month?: string | null;
  summary?: boolean;
};

export function historyHref(params: HistoryHrefParams = {}): string {
  const query: string[] = [];
  if (params.type) query.push(`filter=${params.type}`);
  if (params.categoryId != null) query.push(`category_id=${params.categoryId}`);
  if (params.tagId != null) query.push(`tag_id=${params.tagId}`);
  if (params.merchant) {
    query.push(`merchant=${encodeURIComponent(params.merchant)}`);
  }
  if (params.month) query.push(`month=${params.month}`);
  if (params.summary) query.push("summary=1");
  return query.length
    ? `${SCREENS.HISTORY}?${query.join("&")}`
    : SCREENS.HISTORY;
}

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

// Title-cases each word but preserves all-uppercase tokens (acronyms like UPI, EMI).
// "credit card" → "Credit Card"; "UPI" → "UPI"; "other" → "Other".
export function smartCapitalize(s: string): string {
  return s
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
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

export function getInitials(name: string, maxLen = 2): string {
  return name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, maxLen);
}

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

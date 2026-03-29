import { format, parse } from "date-fns";
import { TRANSACTION_TYPE } from "@/lib/constants";

export interface ParsedTransaction {
  amount: number;
  merchant: string;
  date: string;
  type: "expense" | "income";
  source: string;
}

const BANK_IDENTIFIERS = {
  AXIS: "axisbank",
  HDFC: "hdfcbank",
} as const;

export function parseAxisBankEmail(body: string): ParsedTransaction | null {
  const amountMatch = body.match(/Amount Debited:\s*INR ([\d,]+\.?\d*)/i);
  const dateMatch = body.match(
    /Date & Time:\s*(\d{2}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/i,
  );
  const merchantMatch = body.match(/Transaction Info:\s*[\w/]+\/([\w\s]+)$/im);

  if (!amountMatch || !dateMatch) return null;

  const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
  const rawDate = dateMatch[1]; // 27-03-26
  const rawTime = dateMatch[2] ?? "00:00:00";
  const parsed = parse(
    `${rawDate} ${rawTime}`,
    "dd-MM-yy HH:mm:ss",
    new Date(),
  );
  const date = format(parsed, "yyyy-MM-dd HH:mm");

  const merchant = merchantMatch ? merchantMatch[1].trim() : "unknown";

  return {
    amount,
    merchant,
    date,
    type: TRANSACTION_TYPE.EXPENSE,
    source: "upi",
  };
}

export function parseHdfcEmail(body: string): ParsedTransaction | null {
  const match = body.match(
    /Rs\.([\d,]+\.?\d*) is debited from your HDFC Bank [\w\s]+ ending (\d+) towards (.+?) on (\d{2} \w+, \d{4})(?: at (\d{2}:\d{2}:\d{2}))?/i,
  );

  if (!match) return null;

  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  const merchant = match[3].trim();
  const rawDate = match[4]; // "29 Mar, 2026"
  const rawTime = match[5] ?? "00:00:00";
  const parsed = parse(
    `${rawDate} ${rawTime}`,
    "dd MMM, yyyy HH:mm:ss",
    new Date(),
  );
  const date = format(parsed, "yyyy-MM-dd HH:mm");

  return {
    amount,
    merchant,
    date,
    type: TRANSACTION_TYPE.EXPENSE,
    source: "credit card",
  };
}

export function parseEmail(
  from: string,
  body: string,
): ParsedTransaction | null {
  if (from.includes(BANK_IDENTIFIERS.AXIS)) return parseAxisBankEmail(body);
  if (from.includes(BANK_IDENTIFIERS.HDFC)) return parseHdfcEmail(body);
  return null;
}

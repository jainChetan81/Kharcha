import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseIdfcDate(raw: string): string {
  const formats = [
    "dd-MM-yyyy",
    "dd/MM/yyyy",
    "dd-MMM-yy",
    "dd-MMM-yyyy",
    "dd MMM yyyy",
  ];
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your IDFC FIRST Bank Credit Card ending 1234 was used for Rs.2500 at MERCHANT on DD-MM-YYYY"
// "INR 1,500.00 spent on your IDFC FIRST Bank Card ending 1234 at MERCHANT"
export const idfcCardDebit: Parser = (body) => {
  if (!body.match(/IDFC/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:spent|debited|used)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "IDFC Card Payment",
    date: dateMatch
      ? parseIdfcDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Rs.50000 credited to your IDFC FIRST Bank account ending 1234"
export const idfcCredit: Parser = (body) => {
  if (!body.match(/IDFC/i)) return null;
  if (!body.match(/credited/i)) return null;

  const amountStr = body.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s+|is\s+)?credited/i,
  )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4})/i,
  );
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "IDFC Credit",
    date: dateMatch
      ? parseIdfcDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const IDFC_PARSERS: Parser[] = [idfcCardDebit, idfcCredit];

import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseHsbcDate(raw: string): string {
  const formats = ["dd/MM/yyyy", "dd-MM-yyyy", "dd-MMM-yyyy", "dd MMM yyyy"];
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your HSBC Credit Card ending 1234 has been used for INR 2,500.00 at MERCHANT on DD/MM/YYYY"
// "A purchase of INR 999.00 was made on your HSBC Card ending 1234 at MERCHANT"
export const hsbcCardDebit: Parser = (body) => {
  if (!body.match(/HSBC/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:was|has been)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "HSBC Card Payment",
    date: dateMatch
      ? parseHsbcDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const HSBC_PARSERS: Parser[] = [hsbcCardDebit];

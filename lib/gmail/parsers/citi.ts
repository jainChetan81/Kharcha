import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseCitiDate(raw: string): string {
  const formats = ["dd/MM/yyyy", "dd-MM-yyyy", "dd-MMM-yy", "dd MMM yyyy"];
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your Citi Credit Card XX1234 has been charged INR 2,500.00 at MERCHANT on DD/MM/YYYY"
// "Transaction of INR 1,500 on your Citibank Card ending 1234 at MERCHANT"
export const citiCardDebit: Parser = (body) => {
  if (!body.match(/Citi/i)) return null;

  const amountStr =
    body.match(/(?:charged|for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(
      /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:on your|has been|was)/i,
    )?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Citi Card Payment",
    date: dateMatch
      ? parseCitiDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const CITI_PARSERS: Parser[] = [citiCardDebit];

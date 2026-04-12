import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseScDate(raw: string): string {
  const formats = ["dd/MM/yyyy", "dd-MM-yyyy", "dd-MMM-yy", "dd-MMM-yyyy"];
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your Standard Chartered Card ending 1234 was used for INR 2,500.00 at MERCHANT on DD/MM/YYYY"
// "A transaction of INR 1,500 has been made on your Standard Chartered Credit Card ending 1234"
export const scCardDebit: Parser = (body) => {
  if (!body.match(/Standard\s+Chartered/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:has been|was)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4})/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SC Card Payment",
    date: dateMatch
      ? parseScDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "INR 50,000.00 has been credited to your Standard Chartered account ending 1234"
export const scCredit: Parser = (body) => {
  if (!body.match(/Standard\s+Chartered/i)) return null;
  if (!body.match(/credited/i)) return null;

  const amountStr = body.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s+)?credited/i,
  )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4})/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: "Standard Chartered Credit",
    date: dateMatch
      ? parseScDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const SC_PARSERS: Parser[] = [scCardDebit, scCredit];

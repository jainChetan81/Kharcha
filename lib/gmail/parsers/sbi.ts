import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseSbiDate(raw: string): string {
  // Handles: "01Apr25", "01APR25", "01-Apr-25", "01/04/2025", "01Apr2025"
  const cleaned = raw.replace(/\s+/g, "").trim();
  const formats = [
    "ddMMMyy",
    "ddMMMyyyy",
    "dd-MMM-yy",
    "dd-MMM-yyyy",
    "dd/MM/yyyy",
    "dd-MM-yy",
  ];
  for (const fmt of formats) {
    try {
      const d = parse(cleaned, fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your A/c no. XXXXXXXX1234 is debited for Rs.1500.00 on 01APR25"
// "Dear Customer, Rs 1,234.00 debited from A/c XXXX1234 on 01-Apr-25 by UPI ref 123456"
export const sbiDebit: Parser = (body) => {
  if (!body.match(/SBI|State\s+Bank/i)) return null;
  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:is\s+)?(?:debited|withdrawn)/i,
    )?.[1] ??
    body.match(
      /(?:debited|withdrawn)\s+(?:for|with|of)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}\s*\w{3}\s*\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})/i,
  );
  const merchantMatch = body.match(
    /(?:to\s+|towards\s+|by\s+|Info[:\s]*)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SBI Debit",
    date: dateMatch
      ? parseSbiDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Your A/c no. XXXXXXXX1234 is credited by Rs.50000.00 on 01APR25"
export const sbiCredit: Parser = (body) => {
  if (!body.match(/SBI|State\s+Bank/i)) return null;
  const amountStr =
    body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:is\s+)?credited/i)?.[1] ??
    body.match(
      /credited\s+(?:by|with|for)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}\s*\w{3}\s*\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})/i,
  );
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SBI Credit",
    date: dateMatch
      ? parseSbiDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const SBI_PARSERS: Parser[] = [sbiDebit, sbiCredit];

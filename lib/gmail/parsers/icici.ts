import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseIciciDate(raw: string): string {
  // Handles: "01-Apr-25", "01-04-2025", "01-Apr-2025"
  const formats = [
    "dd-MMM-yy",
    "dd-MM-yyyy",
    "dd-MMM-yyyy",
    "dd/MM/yyyy",
    "dd-MM-yy",
  ];
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Your ICICI Bank Account XX1234 has been debited with INR 1,500.00 on 01-Apr-25"
// or "Dear Customer, INR 1500.00 has been debited from your ICICI Bank Ac XX1234 on 01-Apr-25"
export const iciciDebit: Parser = (body) => {
  const amountStr =
    body.match(
      /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:has been|is)\s+debited\s+(?:from|with)\s+(?:your\s+)?ICICI\s+Bank/i,
    )?.[1] ??
    body.match(
      /ICICI\s+Bank\s+(?:Account|Ac|A\/c)\s*\w*\s*\w*\s*(?:has been|is)\s+debited\s+(?:with|for)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})/i,
  );
  const merchantMatch = body.match(
    /(?:Info[:\s]*|towards\s+|at\s+|to\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "ICICI Debit",
    date: dateMatch
      ? parseIciciDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Your ICICI Bank Account XX1234 has been credited with INR 50,000.00 on 01-Apr-25"
export const iciciCredit: Parser = (body) => {
  if (!body.match(/ICICI/i)) return null;
  const amountStr =
    body.match(
      /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:has been|is)\s+credited/i,
    )?.[1] ??
    body.match(
      /credited\s+(?:with|for)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})/i,
  );
  const merchantMatch = body.match(
    /(?:from\s+|by\s+|Info[:\s]*)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "ICICI Credit",
    date: dateMatch
      ? parseIciciDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.INCOME,
  };
};

// "Your ICICI Bank Credit Card XX1234 has been used for a transaction of INR 2,500.00 at MERCHANT on 01-Apr-25"
export const iciciCreditCard: Parser = (body) => {
  const amountMatch = body.match(
    /(?:transaction\s+of|for)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
  );
  if (!amountMatch || !body.match(/ICICI/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending)/i)) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}[-/]\d{2}[-/]\d{2,4})/i,
  );

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Credit Card Payment",
    date: dateMatch
      ? parseIciciDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const ICICI_PARSERS: Parser[] = [
  iciciCreditCard,
  iciciDebit,
  iciciCredit,
];

import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  fallbackNow,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
} from "./utils";

// "Your ICICI Bank Account XX1234 has been debited with INR 1,500.00 on 01-Apr-25"
export const iciciDebit: Parser = (body) => {
  if (!body.match(/ICICI/i)) return null;
  const amountStr =
    body.match(
      /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:has been|is)\s+debited/i,
    )?.[1] ??
    body.match(/debited\s+(?:with|for)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:Info[:\s]*|towards\s+|at\s+|to\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "ICICI Debit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
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

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:from\s+|by\s+|Info[:\s]*)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "ICICI Credit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.INCOME,
  };
};

// "Your ICICI Bank Credit Card XX1234 has been used for INR 2,500.00 at MERCHANT on 01-Apr-25"
export const iciciCreditCard: Parser = (body) => {
  if (!body.match(/ICICI/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending)/i)) return null;

  const amountMatch = body.match(
    /(?:transaction\s+of|for)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
  );
  if (!amountMatch) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Credit Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const ICICI_PARSERS: Parser[] = [
  iciciCreditCard,
  iciciDebit,
  iciciCredit,
];

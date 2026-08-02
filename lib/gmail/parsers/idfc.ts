import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// "Your IDFC FIRST Bank Credit Card ending 1234 was used for Rs.2500 at MERCHANT on DD-MM-YYYY"
export const idfcCardDebit: Parser = (body) => {
  if (!body.match(/IDFC/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending|debit(?:ed)?)/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:spent|debited|used)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "IDFC Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Rs.50000 credited to your IDFC FIRST Bank account ending 1234"
export const idfcCredit: Parser = (body) => {
  if (!body.match(/IDFC/i)) return null;

  const amountStr = body.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*(?:has been\s+|is\s+)?credited/i,
  )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "IDFC Credit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const IDFC_PARSERS: Parser[] = [idfcCardDebit, idfcCredit].map(
  withGuard,
);

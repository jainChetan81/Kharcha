import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// "Your HSBC Credit Card ending 1234 has been used for INR 2,500.00 at MERCHANT on DD/MM/YYYY"
export const hsbcCardDebit: Parser = (body) => {
  if (!body.match(/HSBC/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending|debit(?:ed)?)/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:was|has been)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "HSBC Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const HSBC_PARSERS: Parser[] = [hsbcCardDebit].map(withGuard);

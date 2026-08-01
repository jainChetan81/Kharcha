import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  fallbackNow,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// "Your Citi Credit Card XX1234 has been charged INR 2,500.00 at MERCHANT on DD/MM/YYYY"
export const citiCardDebit: Parser = (body) => {
  if (!body.match(/Citi/i)) return null;

  const amountStr =
    body.match(/(?:charged|for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(
      /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:on your|has been|was)/i,
    )?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Citi Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const CITI_PARSERS: Parser[] = [citiCardDebit].map(withGuard);

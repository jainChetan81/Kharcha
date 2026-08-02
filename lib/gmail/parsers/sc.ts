import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// "Your Standard Chartered Card ending 1234 was used for INR 2,500.00 at MERCHANT on DD/MM/YYYY"
export const scCardDebit: Parser = (body) => {
  if (!body.match(/Standard\s+Chartered/i)) return null;

  const amountStr =
    body.match(/(?:for|of)\s+(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i)?.[1] ??
    body.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s+(?:has been|was)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SC Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
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

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch
      ? merchantMatch[1].trim()
      : "Standard Chartered Credit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const SC_PARSERS: Parser[] = [scCardDebit, scCredit].map(withGuard);

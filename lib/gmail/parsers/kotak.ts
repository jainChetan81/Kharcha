import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  fallbackNow,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
} from "./utils";

// "Rs.1500 debited from your Kotak Bank A/c X1234 on 01-04-25"
export const kotakDebit: Parser = (body) => {
  if (!body.match(/Kotak/i)) return null;
  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:has been\s+|is\s+)?debited/i,
    )?.[1] ??
    body.match(
      /debited\s+(?:from|for|with)\s+.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:at|to|towards|Info[:\s]*)\s*([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+UPI|\s+Ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Debit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Rs.50000 credited to your Kotak Bank A/c X1234 on 01-04-25"
export const kotakCredit: Parser = (body) => {
  if (!body.match(/Kotak/i)) return null;
  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:has been\s+|is\s+)?credited/i,
    )?.[1] ??
    body.match(
      /credited\s+(?:to|with|for)\s+.*?(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+Ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Credit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.INCOME,
  };
};

// "Your Kotak Credit Card XX1234 was used for Rs.2500 at MERCHANT on 01-04-25"
export const kotakCreditCard: Parser = (body) => {
  if (!body.match(/Kotak/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending|card\s+XX)/i)) return null;

  const amountMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  if (!amountMatch) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const KOTAK_PARSERS: Parser[] = [
  kotakCreditCard,
  kotakDebit,
  kotakCredit,
];

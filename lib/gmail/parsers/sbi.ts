import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  fallbackNow,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// "Your A/c no. XXXXXXXX1234 is debited for Rs.1500.00 on 01APR25"
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

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:to\s+|towards\s+|by\s+|Info[:\s]*)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SBI Debit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
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

  const dateMatch = body.match(DATE_REGEX);
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "SBI Credit",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),
    type: TRANSACTION_TYPE.INCOME,
  };
};

export const SBI_PARSERS: Parser[] = [sbiDebit, sbiCredit].map(withGuard);

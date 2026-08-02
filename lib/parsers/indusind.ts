import type { Parser } from "./types";
import { parseAmount, parseAxisDate, today, withGuard } from "./utils";

const indusindUpiDebit: Parser = (text) => {
  const amountMatch = text.match(/Debited for INR ([\d,]+\.?\d*)/i);
  const upiMatch = text.match(/towards\s+UPI\/[\d]+\/DR\/([^/]+)/i);

  if (!amountMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: upiMatch ? upiMatch[1].trim() : "UPI Payment",
    date: today(),
    type: "expense",
  };
};

const indusindUpiCredit: Parser = (text) => {
  const amountMatch = text.match(/Credited for INR ([\d,]+\.?\d*)/i);
  const upiMatch = text.match(/towards\s+UPI\/[\d]+\/CR\/([^/]+)/i);

  if (!amountMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: upiMatch ? upiMatch[1].trim() : "Credit",
    date: today(),
    type: "income",
  };
};

const indusindImpsCredit: Parser = (text) => {
  const amountMatch = text.match(/credited by Rs\.?([\d,]+\.?\d*)/i);
  const dateMatch = text.match(/on (\d{2}-\d{2}-\d{2})/i);
  const fromMatch = text.match(
    /received from account\s+[\dX]+\/([\w\s]+?)(?:\s*\(|$)/i,
  );

  if (!amountMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: fromMatch ? fromMatch[1].trim() : "IMPS Credit",
    date: dateMatch ? parseAxisDate(dateMatch[1]) : today(),
    type: "income",
  };
};

export const INDUSIND_PARSERS: Parser[] = [
  indusindUpiDebit,
  indusindUpiCredit,
  indusindImpsCredit,
].map(withGuard);

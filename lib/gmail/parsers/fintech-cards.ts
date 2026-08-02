import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  DATE_REGEX,
  type Parser,
  parseAmount,
  parseIndianDate,
  withGuard,
} from "./utils";

// --- Slice ---
// "Rs X spent on Slice Card at MERCHANT on DD/MM/YYYY"
export const sliceDebit: Parser = (body) => {
  if (!body.match(/Slice/i)) return null;

  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:spent|used|debited)/i,
    )?.[1] ??
    body.match(/(?:spent|used|debited)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Slice Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// --- OneCard ---
// "Rs X spent using OneCard at MERCHANT on DD/MM/YYYY"
export const oneCardDebit: Parser = (body) => {
  if (!body.match(/OneCard/i)) return null;

  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:spent|debited|used)/i,
    )?.[1] ??
    body.match(/(?:spent|debited|used)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "OneCard Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// --- Uni Card ---
// "Rs X spent on Uni Card at MERCHANT"
export const uniCardDebit: Parser = (body) => {
  if (!body.match(/Uni\s*Card|Uni\s*Pay/i)) return null;

  // Require a transaction keyword so we don't match random amounts in promo emails
  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:spent|debited|used|charged|paid)/i,
    )?.[1] ??
    body.match(
      /(?:spent|debited|used|charged|paid|payment\s+of)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
    )?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );
  const dateMatch = body.match(DATE_REGEX);

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Uni Card Payment",
    date: dateMatch ? parseIndianDate(dateMatch[1]) : null,
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const SLICE_PARSERS: Parser[] = [sliceDebit].map(withGuard);
export const ONECARD_PARSERS: Parser[] = [oneCardDebit].map(withGuard);
export const UNI_PARSERS: Parser[] = [uniCardDebit].map(withGuard);

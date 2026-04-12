import { format } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

const today = () => format(new Date(), DATE_TIME_FORMAT);

// --- Slice ---
// "Rs X spent on Slice Card at MERCHANT on DD/MM/YYYY"
// "You spent Rs.1,500 using Slice at MERCHANT"
export const sliceDebit: Parser = (body) => {
  if (!body.match(/Slice/i)) return null;

  const amountStr =
    body.match(
      /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s*(?:spent|used|debited)/i,
    )?.[1] ??
    body.match(/(?:spent|used|debited)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards|on)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Slice Payment",
    date: today(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// --- OneCard ---
// "Rs X spent using OneCard at MERCHANT"
// "INR 2,500.00 debited from your OneCard at MERCHANT on DD/MM/YYYY"
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

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "OneCard Payment",
    date: today(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// --- Uni Card ---
// "Rs X spent on Uni Card at MERCHANT"
// "You've made a payment of Rs.1500 using your Uni Card at MERCHANT"
export const uniCardDebit: Parser = (body) => {
  if (!body.match(/Uni\s*Card|Uni\s*Pay/i)) return null;

  const amountStr = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i)?.[1];
  if (!amountStr) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Uni Card Payment",
    date: today(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const SLICE_PARSERS: Parser[] = [sliceDebit];
export const ONECARD_PARSERS: Parser[] = [oneCardDebit];
export const UNI_PARSERS: Parser[] = [uniCardDebit];

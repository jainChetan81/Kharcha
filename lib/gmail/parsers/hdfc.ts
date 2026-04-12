import { TRANSACTION_TYPE } from "@/lib/constants";
import {
  fallbackNow,
  MERCHANT_REGEX,
  type Parser,
  parseAmount,
  parseHdfcDate,
} from "./utils";

// "Rs.X debited from your HDFC Bank ... ending 1234 towards merchant on DD Mon, YYYY"
export const hdfcDebit: Parser = (body) => {
  const match = body.match(
    /Rs\.([\d,]+\.?\d*)\s+(?:is\s+)?debited from your HDFC Bank[\w\s]+ending\s+(\d+)\s+towards\s+(.+?)\s+on\s+(\d{2}\s+\w+,?\s+\d{4})(?:\s+at\s+(\d{2}:\d{2}:\d{2}))?/i,
  );

  if (!match) return null;

  return {
    amount: parseAmount(match[1]),
    merchant: match[3].trim(),
    date: parseHdfcDate(match[4], match[5]),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

// "Rs.X credited to your HDFC Bank A/c ... ending 1234 on DD Mon, YYYY"
export const hdfcCredit: Parser = (body) => {
  const match = body.match(
    /Rs\.([\d,]+\.?\d*)\s+(?:is\s+)?credited\s+to\s+(?:your\s+)?HDFC\s+Bank[\w\s]+ending\s+\d+\s+(?:on|dated)\s+(\d{2}\s+\w+,?\s+\d{4})(?:\s+at\s+(\d{2}:\d{2}:\d{2}))?/i,
  );
  if (!match) return null;

  const merchantMatch = body.match(
    /(?:from\s+|by\s+|Info[:\s]*)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s*$)/i,
  );

  return {
    amount: parseAmount(match[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "HDFC Credit",
    date: parseHdfcDate(match[2], match[3]),
    type: TRANSACTION_TYPE.INCOME,
  };
};

// "Your HDFC Bank Credit Card ending 1234 has been used for Rs.2500 at MERCHANT on DD-Mon-YYYY"
// "Thank you for using your HDFC Bank Credit Card ending 1234 for Rs 999.00 at MERCHANT on DD/MM/YYYY"
export const hdfcCreditCard: Parser = (body) => {
  if (!body.match(/HDFC/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending)/i)) return null;

  const amountMatch = body.match(
    /(?:for|of)\s+(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i,
  );
  if (!amountMatch) return null;

  const merchantMatch = body.match(MERCHANT_REGEX);
  const dateMatch = body.match(
    /on\s+(\d{2}\s+\w+,?\s+\d{4})(?:\s+at\s+(\d{2}:\d{2}:\d{2}))?/i,
  );

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "HDFC Card Payment",
    date: dateMatch ? parseHdfcDate(dateMatch[1], dateMatch[2]) : fallbackNow(),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const HDFC_PARSERS: Parser[] = [hdfcCreditCard, hdfcDebit, hdfcCredit];

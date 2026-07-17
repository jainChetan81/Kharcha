import type { Parser } from "./types";
import { parseAmount, parseAxisDate, today, withGuard } from "./utils";

const axisUpiDebit: Parser = (text) => {
  const amountMatch = text.match(/Amount Debited:\s*INR ([\d,]+\.?\d*)/i);
  const dateMatch = text.match(/Date & Time:\s*(\d{2}-\d{2}-\d{2})/i);
  const merchantMatch = text.match(
    /Transaction Info:\s*UPI\/[\w]+\/([\w\s.]+)/i,
  );

  if (!amountMatch || !dateMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "UPI Payment",
    date: parseAxisDate(dateMatch[1]),
    type: "expense",
  };
};

const axisUpiCredit: Parser = (text) => {
  const amountMatch = text.match(/Amount Credited:\s*INR ([\d,]+\.?\d*)/i);
  const dateMatch = text.match(/Date & Time:\s*(\d{2}-\d{2}-\d{2})/i);
  const merchantMatch = text.match(
    /Transaction Info:\s*UPI\/[\w]+\/([\w\s.]+)/i,
  );

  if (!amountMatch || !dateMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Credit",
    date: parseAxisDate(dateMatch[1]),
    type: "income",
  };
};

const axisCreditCard: Parser = (text) => {
  const amountMatch = text.match(/Transaction Amount:\s*INR ([\d,]+\.?\d*)/i);
  const merchantMatch = text.match(/Merchant Name:\s*([^\s].+?)(?:\s+Axis)/i);
  const dateMatch = text.match(/(\d{2}-\d{2}-\d{4})\s+Dear/i);

  if (!amountMatch) return null;

  let date: string;
  if (dateMatch) {
    const [day, month, year] = dateMatch[1].split("-");
    date = parseAxisDate(`${day}-${month}-${year.slice(2)}`);
  } else {
    const altDate = text.match(/Date[:\s]*(\d{2}-\d{2}-\d{2})/i);
    date = altDate ? parseAxisDate(altDate[1]) : today();
  }

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Credit Card Payment",
    date,
    type: "expense",
  };
};

// "INR {amount} credited to A/c no. XX{last4} on {DD-MM-YY} at {HH:mm:ss} IST. Info - NEFT/CMS{ref}/{remitter}."
// The single-line NEFT/IMPS credit format monthly salary arrives in — the
// mini-side audit found months of salary credits unparsed for lack of it.
const axisNeftCredit: Parser = (text) => {
  const match = text.match(
    /INR\s+([\d,]+\.?\d*)\s+credited\s+to\s+A\/c\s+no\.\s+XX\d{4}\s+on\s+(\d{2}-\d{2}-\d{2})/i,
  );
  if (!match) return null;

  const infoMatch = text.match(
    /Info\s*[-:]\s*(?:NEFT|IMPS|RTGS)\/[A-Z0-9]+\/([^./\n]+)/i,
  );

  return {
    amount: parseAmount(match[1]),
    merchant: infoMatch ? infoMatch[1].trim() : "NEFT Credit",
    date: parseAxisDate(match[2]),
    type: "income",
  };
};

const axisGenericDebit: Parser = (text) => {
  const amountMatch = text.match(
    /(?:spent|debited)\s*(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i,
  );
  const dateMatch = text.match(/(?:on|dated?)\s*(\d{2}-\d{2}-\d{2})/i);
  const merchantMatch = text.match(/(?:at|towards)\s+(.+?)(?:\s+on|\s+dated)/i);

  if (!amountMatch || !dateMatch) return null;

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Card Payment",
    date: parseAxisDate(dateMatch[1]),
    type: "expense",
  };
};

const axisSubjectDebit: Parser = (text) => {
  const match = text.match(/INR ([\d,]+\.?\d*) was debited/i);
  if (!match) return null;

  return {
    amount: parseAmount(match[1]),
    merchant: "Bank Debit",
    date: today(),
    type: "expense",
  };
};

const axisSubjectCredit: Parser = (text) => {
  const match = text.match(/INR ([\d,]+\.?\d*) was credited/i);
  if (!match) return null;

  return {
    amount: parseAmount(match[1]),
    merchant: "Bank Credit",
    date: today(),
    type: "income",
  };
};

export const AXIS_PARSERS: Parser[] = [
  axisUpiDebit,
  axisUpiCredit,
  axisCreditCard,
  axisNeftCredit,
  axisGenericDebit,
  axisSubjectDebit,
  axisSubjectCredit,
].map(withGuard);

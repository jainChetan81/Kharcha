import { format, parse } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { type Parser, parseAmount } from "./utils";

function parseKotakDate(raw: string): string {
  const cleaned = raw.trim();
  const formats = [
    "dd-MM-yy",
    "dd-MM-yyyy",
    "dd/MM/yyyy",
    "dd-MMM-yy",
    "dd-MMM-yyyy",
    "dd MMM yyyy",
  ];
  for (const fmt of formats) {
    try {
      const d = parse(cleaned, fmt, new Date());
      if (!Number.isNaN(d.getTime())) return format(d, DATE_TIME_FORMAT);
    } catch {}
  }
  return format(new Date(), DATE_TIME_FORMAT);
}

// "Rs.1500 debited from your Kotak Bank A/c X1234 on 01-04-25"
// "Dear Customer, INR 2,000.00 has been debited from your Kotak Mahindra Bank A/c ending 1234"
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

  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i,
  );
  const merchantMatch = body.match(
    /(?:at|to|towards|Info[:\s]*)\s*([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+UPI|\s+Ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Debit",
    date: dateMatch
      ? parseKotakDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
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

  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4}|\d{2}\s+\w{3}\s+\d{4})/i,
  );
  const merchantMatch = body.match(
    /(?:from\s+|by\s+)([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+Ref|\s*$)/i,
  );

  return {
    amount: parseAmount(amountStr),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Credit",
    date: dateMatch
      ? parseKotakDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.INCOME,
  };
};

// "Your Kotak Credit Card XX1234 was used for Rs.2500 at MERCHANT on 01-04-25"
export const kotakCreditCard: Parser = (body) => {
  if (!body.match(/Kotak/i)) return null;
  if (!body.match(/(?:credit\s*card|card\s+ending|card\s+XX)/i)) return null;

  const amountMatch = body.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i);
  if (!amountMatch) return null;

  const merchantMatch = body.match(
    /(?:at|towards)\s+([A-Za-z][\w\s./-]{2,40}?)(?:\s+on\s|\s+dated)/i,
  );
  const dateMatch = body.match(
    /on\s+(\d{2}[-/]\d{2}[-/]\d{2,4}|\d{2}[-/]\w{3}[-/]\d{2,4})/i,
  );

  return {
    amount: parseAmount(amountMatch[1]),
    merchant: merchantMatch ? merchantMatch[1].trim() : "Kotak Card Payment",
    date: dateMatch
      ? parseKotakDate(dateMatch[1])
      : format(new Date(), DATE_TIME_FORMAT),
    type: TRANSACTION_TYPE.EXPENSE,
  };
};

export const KOTAK_PARSERS: Parser[] = [
  kotakCreditCard,
  kotakDebit,
  kotakCredit,
];

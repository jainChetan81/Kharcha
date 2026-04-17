import type { Parser } from "./types";
import { parseAmount, parseHdfcDate } from "./utils";

const hdfcDebit: Parser = (text) => {
  const match = text.match(
    /Rs\.([\d,]+\.?\d*)\s+(?:is\s+)?debited from your HDFC Bank[\w\s]+ending\s+(\d+)\s+towards\s+(.+?)\s+on\s+(\d{2}\s+\w+,?\s+\d{4})/i,
  );

  if (!match) return null;

  return {
    amount: parseAmount(match[1]),
    merchant: match[3].trim(),
    date: parseHdfcDate(match[4]),
    type: "expense",
  };
};

export const HDFC_PARSERS: Parser[] = [hdfcDebit];

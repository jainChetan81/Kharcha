export interface ParsedTransaction {
  amount: number;
  merchant: string;
  date: string;
  type: "expense" | "income";
  source: string;
}

export function parseAxisBankEmail(body: string): ParsedTransaction | null {
  // amount
  const amountMatch = body.match(/Amount Debited:\s*INR ([\d,]+\.?\d*)/i);
  // date
  const dateMatch = body.match(/Date & Time:\s*(\d{2}-\d{2}-\d{2})/i);
  // merchant from transaction info
  const merchantMatch = body.match(/Transaction Info:\s*[\w/]+\/([\w\s]+)$/im);

  if (!amountMatch || !dateMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  const rawDate = dateMatch[1]; // 27-03-26
  const [day, month, year] = rawDate.split("-");
  const date = `20${year}-${month}-${day}`; // 2026-03-27

  const merchant = merchantMatch ? merchantMatch[1].trim() : "unknown";

  return {
    amount,
    merchant,
    date,
    type: "expense",
    source: "upi",
  };
}

export function parseHdfcEmail(body: string): ParsedTransaction | null {
  const match = body.match(
    /Rs\.([\d,]+\.?\d*) is debited from your HDFC Bank [\w\s]+ ending (\d+) towards ([\w\s]+) on (\d{2} \w+, \d{4})/i,
  );

  if (!match) return null;

  const amount = parseFloat(match[1].replace(/,/g, ""));
  const merchant = match[3].trim();
  const rawDate = match[4]; // 28 Mar, 2026
  const date = new Date(rawDate).toISOString().split("T")[0];

  return {
    amount,
    merchant,
    date,
    type: "expense",
    source: "credit card",
  };
}

export function parseEmail(
  from: string,
  body: string,
): ParsedTransaction | null {
  if (from.includes("axisbank")) return parseAxisBankEmail(body);
  if (from.includes("hdfcbank")) return parseHdfcEmail(body);
  return null;
}

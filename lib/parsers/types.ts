export type ParsedTransaction = {
  amount: number;
  merchant: string;
  date: string;
  type: "expense" | "income";
};

export type Parser = (text: string) => ParsedTransaction | null;

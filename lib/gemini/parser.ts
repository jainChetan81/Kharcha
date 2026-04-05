import { env } from "@/lib/env";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const PROMPT = `Extract the financial transaction from this bank notification or email.
Return ONLY a raw JSON object with these exact fields, no markdown, no explanation:
{
  "amount": number (no currency symbol, no commas),
  "merchant": string or null,
  "date": "YYYY-MM-DD",
  "type": "expense" or "income"
}

If this is NOT a bank transaction, return the word null and nothing else.`;

export interface GeminiParsedTransaction {
  amount: number;
  merchant: string | null;
  date: string;
  type: "expense" | "income";
}

export async function parseTransactionWithGemini(
  text: string,
): Promise<GeminiParsedTransaction | null> {
  if (!env.GEMINI_API_KEY) return null;

  try {
    const response = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT}\n\nText:\n${text.slice(0, 4000)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
        },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!raw || raw.toLowerCase() === "null") return null;

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed.amount !== "number" ||
      parsed.amount <= 0 ||
      !["income", "expense"].includes(parsed.type) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
    ) {
      return null;
    }

    return {
      amount: parsed.amount,
      merchant: parsed.merchant || null,
      date: parsed.date,
      type: parsed.type,
    };
  } catch {
    return null;
  }
}

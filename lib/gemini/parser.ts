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

export interface GeminiParseResult {
  parsed: GeminiParsedTransaction | null;
  raw: string | null;
}

export async function parseTransactionWithGemini(
  text: string,
): Promise<GeminiParseResult> {
  if (!env.GEMINI_API_KEY) return { parsed: null, raw: null };

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

    if (!response.ok) return { parsed: null, raw: null };

    const data = await response.json();
    const raw: string | null =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;

    if (!raw || raw.toLowerCase() === "null") return { parsed: null, raw };

    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (
        typeof parsed.amount !== "number" ||
        parsed.amount <= 0 ||
        !["income", "expense"].includes(parsed.type) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ) {
        return { parsed: null, raw };
      }

      return {
        parsed: {
          amount: parsed.amount,
          merchant: parsed.merchant || null,
          date: parsed.date,
          type: parsed.type,
        },
        raw,
      };
    } catch {
      return { parsed: null, raw };
    }
  } catch {
    return { parsed: null, raw: null };
  }
}

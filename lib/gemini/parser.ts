import { GEMINI_ERROR, type GeminiErrorType } from "@/lib/constants";
import { env } from "@/lib/env";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const PROMPT = `Extract the financial transaction from this bank notification or email.
- amount: principal as a number, no symbols/commas. 0 if not a transaction.
- merchant: counterparty name. null if absent.
- source: bank or card issuer (e.g. "HDFC", "Axis Bank"). null if absent.
- date: strict YYYY-MM-DD.
- type: "expense" or "income".`;

const MESSAGE_PROMPT = `Extract a financial transaction from an Indian bank SMS, push notification, or email. Treat "INR", "Rs.", "Rs", "NR" as rupees.

- is_transaction: true for real money movement (debit/credit/payment/refund/transfer). false for OTPs, balance enquiries, promos, login alerts.
- amount: principal as a number, no symbols/commas. 0 if not a transaction.
- type: "expense" for debited/spent/sent/paid/withdrawn. "income" for credited/received/refunded.
- source: bank or card issuer (e.g. "HDFC", "Axis Bank", "Amex"). null if absent.
- date: strict YYYY-MM-DD. Indian SMS use DD-MM-YY, e.g. "07-04-26" → "2026-04-07". Use the provided Today date if only time is shown.
- merchant: counterparty (UPI handle, name, store, biller). For "UPI/P2M/123/JOHN DOE" → "JOHN DOE". null if absent.
- is_subscription: true ONLY if message mentions recurring/subscription/auto-debit/autopay/SI/standing instruction/mandate. One-off UPI payments are NOT subscriptions.
- billing_day: 1-31 only when is_subscription, else null.
- confidence: "high" if amount/type/date/(merchant or source) all unambiguous. "medium" if 1-2 inferred. "low" if vague.`;

const MESSAGE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_transaction: { type: "BOOLEAN" },
    amount: { type: "NUMBER" },
    type: { type: "STRING", enum: ["expense", "income"] },
    source: { type: "STRING", nullable: true },
    date: { type: "STRING" },
    merchant: { type: "STRING", nullable: true },
    is_subscription: { type: "BOOLEAN" },
    billing_day: { type: "INTEGER", nullable: true },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: [
    "is_transaction",
    "amount",
    "type",
    "date",
    "is_subscription",
    "confidence",
  ],
};

const TRANSACTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    amount: { type: "NUMBER" },
    merchant: { type: "STRING", nullable: true },
    source: { type: "STRING", nullable: true },
    date: { type: "STRING" },
    type: { type: "STRING", enum: ["expense", "income"] },
  },
  required: ["amount", "date", "type"],
};

export interface GeminiParsedTransaction {
  amount: number;
  merchant: string | null;
  source: string | null;
  date: string;
  type: "expense" | "income";
}

export interface GeminiParseResult {
  parsed: GeminiParsedTransaction | null;
  raw: string | null;
  error?: GeminiErrorType;
}

export interface GeminiParsedMessage {
  amount: number;
  type: "expense" | "income";
  source: string | null;
  date: string;
  merchant: string | null;
  is_subscription: boolean;
  billing_day: number | null;
  confidence: "high" | "medium" | "low";
}

export interface GeminiParseMessageResult {
  parsed: GeminiParsedMessage | null;
  raw: string | null;
  error?: GeminiErrorType;
}

export async function parseMessageWithGemini(
  text: string,
): Promise<GeminiParseMessageResult> {
  if (!env.GEMINI_API_KEY) {
    console.warn("[parseMessageWithGemini] missing GEMINI_API_KEY");
    return { parsed: null, raw: null };
  }

  const today = new Date().toLocaleDateString("en-CA");

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${MESSAGE_PROMPT}\n\nText:\n${text.slice(0, 4000)}\n\nToday: ${today}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 500,
            responseMimeType: "application/json",
            responseSchema: MESSAGE_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => "<no body>");
      if (response.status === 503) {
        return {
          parsed: null,
          raw: null,
          error: GEMINI_ERROR.SERVICE_UNAVAILABLE,
        };
      }
      if (response.status === 429) {
        return {
          parsed: null,
          raw: null,
          error: GEMINI_ERROR.RATE_LIMITED,
        };
      }
      console.warn(
        "[parseMessageWithGemini] http error",
        response.status,
        errBody,
      );
      return { parsed: null, raw: null };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const raw: string | null =
      candidate?.content?.parts?.[0]?.text?.trim() ?? null;
    const finishReason: string | undefined = candidate?.finishReason;

    if (finishReason === "MAX_TOKENS") {
      console.warn(
        "[parseMessageWithGemini] response truncated by MAX_TOKENS, raising maxOutputTokens may help",
      );
      return { parsed: null, raw };
    }

    if (!raw) {
      console.warn("[parseMessageWithGemini] empty response from gemini");
      return { parsed: null, raw: null };
    }

    let parsed: GeminiParsedMessage & { is_transaction: boolean };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[parseMessageWithGemini] json parse failed", err);
      return { parsed: null, raw };
    }

    if (!parsed.is_transaction || parsed.amount <= 0) {
      console.warn("[parseMessageWithGemini] not a transaction or amount <= 0");
      return { parsed: null, raw };
    }

    const { is_transaction: _ignored, ...result } = parsed;
    return { parsed: result, raw };
  } catch (err) {
    console.warn("[parseMessageWithGemini] fetch failed", err);
    return { parsed: null, raw: null };
  }
}

export async function parseTransactionWithGemini(
  text: string,
): Promise<GeminiParseResult> {
  if (!env.GEMINI_API_KEY) return { parsed: null, raw: null };

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
      {
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
            maxOutputTokens: 500,
            responseMimeType: "application/json",
            responseSchema: TRANSACTION_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 503) {
        return {
          parsed: null,
          raw: null,
          error: GEMINI_ERROR.SERVICE_UNAVAILABLE,
        };
      }
      if (response.status === 429) {
        return {
          parsed: null,
          raw: null,
          error: GEMINI_ERROR.RATE_LIMITED,
        };
      }
      return { parsed: null, raw: null };
    }

    const data = await response.json();
    const raw: string | null =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;

    if (!raw) return { parsed: null, raw };

    try {
      const parsed = JSON.parse(raw);

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
          source: parsed.source || null,
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

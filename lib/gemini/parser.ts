import { format } from "date-fns";
import { GEMINI_ERROR, type GeminiErrorType } from "@/lib/constants";
import { env } from "@/lib/env";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_INPUT_CHARS = 4000;
const GEMINI_TIMEOUT_MS = 15_000;
const FINISH_REASON_MAX_TOKENS = "MAX_TOKENS";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const PROMPT = `Extract the financial transaction from this bank notification or email.
- is_transaction: true for real money movement (debit/credit/payment/refund). false for OTPs, balance enquiries, promos.
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
    is_transaction: { type: "BOOLEAN" },
    amount: { type: "NUMBER" },
    merchant: { type: "STRING", nullable: true },
    source: { type: "STRING", nullable: true },
    date: { type: "STRING" },
    type: { type: "STRING", enum: ["expense", "income"] },
  },
  required: ["is_transaction", "amount", "date", "type"],
};

// note: deliberately omits is_subscription/billing_day — only the paste-message
// flow infers subscriptions; the gmail sync path does not.
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

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

async function callGemini<T>(
  userContent: string,
  schema: object,
): Promise<{ parsed: T | null; raw: string | null; error?: GeminiErrorType }> {
  if (!env.GEMINI_API_KEY) return { parsed: null, raw: null };

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 500,
            responseMimeType: "application/json",
            responseSchema: schema,
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

    const data = (await response.json()) as GeminiApiResponse;
    const candidate = data.candidates?.[0];
    const raw: string | null =
      candidate?.content?.parts?.[0]?.text?.trim() ?? null;
    const finishReason: string | undefined = candidate?.finishReason;

    if (finishReason === FINISH_REASON_MAX_TOKENS) {
      return { parsed: null, raw, error: GEMINI_ERROR.TRUNCATED };
    }

    if (!raw) return { parsed: null, raw: null };

    try {
      const parsed = JSON.parse(raw) as T;
      return { parsed, raw };
    } catch {
      return { parsed: null, raw };
    }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { parsed: null, raw: null, error: GEMINI_ERROR.TIMEOUT };
    }
    return { parsed: null, raw: null };
  }
}

export async function parseMessageWithGemini(
  text: string,
): Promise<GeminiParseMessageResult> {
  const today = format(new Date(), "yyyy-MM-dd");
  const userContent = `${MESSAGE_PROMPT}\n\nText:\n${text.slice(0, MAX_INPUT_CHARS)}\n\nToday: ${today}`;

  const result = await callGemini<
    GeminiParsedMessage & { is_transaction: boolean }
  >(userContent, MESSAGE_RESPONSE_SCHEMA);

  if (!result.parsed) {
    return { parsed: null, raw: result.raw, error: result.error };
  }

  const parsed = result.parsed;

  if (
    !parsed.is_transaction ||
    parsed.amount <= 0 ||
    !DATE_REGEX.test(parsed.date)
  ) {
    return { parsed: null, raw: result.raw };
  }

  // discard is_transaction — already validated above
  const { is_transaction, ...rest } = parsed;
  void is_transaction;
  return { parsed: rest, raw: result.raw };
}

export async function parseTransactionWithGemini(
  text: string,
): Promise<GeminiParseResult> {
  const userContent = `${PROMPT}\n\nText:\n${text.slice(0, MAX_INPUT_CHARS)}`;

  const result = await callGemini<
    GeminiParsedTransaction & { is_transaction: boolean }
  >(userContent, TRANSACTION_RESPONSE_SCHEMA);

  if (!result.parsed) {
    return { parsed: null, raw: result.raw, error: result.error };
  }

  const parsed = result.parsed;

  if (
    !parsed.is_transaction ||
    parsed.amount <= 0 ||
    !DATE_REGEX.test(parsed.date)
  ) {
    return { parsed: null, raw: result.raw };
  }

  // discard is_transaction — already validated above
  const { is_transaction, ...rest } = parsed;
  void is_transaction;
  return {
    parsed: {
      ...rest,
      merchant: rest.merchant || null,
      source: rest.source || null,
    },
    raw: result.raw,
  };
}

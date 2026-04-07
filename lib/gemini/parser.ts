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
- source: payment rail — one of "UPI", "credit card", "debit card", "other". Use "UPI" for VPA/UPI handles, card only when explicitly stated, else "other".
- date: strict YYYY-MM-DD.
- type: "expense" or "income".`;

const MESSAGE_PROMPT = `Extract a financial transaction from an Indian bank SMS, push notification, or email. Treat "INR", "Rs.", "Rs", "NR" as rupees.

- is_transaction: true for real money movement (debit/credit/payment/refund/transfer). false for OTPs, balance enquiries, promos, login alerts.
- amount: principal as a number, no symbols/commas. 0 if not a transaction.
- type: "expense" for debited/spent/sent/paid/withdrawn. "income" for credited/received/refunded.
- source: payment rail — one of "UPI", "credit card", "debit card", "other". Use "UPI" when the message contains "UPI/", "VPA", or a UPI handle. Use "credit card" / "debit card" only when the message explicitly says credit/debit card. Otherwise "other".
- date: strict YYYY-MM-DD. Indian SMS use DD-MM-YY, e.g. "07-04-26" → "2026-04-07". Use the provided Today date if only time is shown.
- merchant: counterparty (store, biller, person, UPI handle). ALWAYS extract if any name is present. Examples:
    - "UPI/P2M/308684736943/Bharat Petroleum Co" → "Bharat Petroleum Co"
    - "UPI/P2A/12345/JOHN DOE@okaxis" → "JOHN DOE"
    - "to VPA merchant@paytm" → "merchant"
    - "at SWIGGY*ORDER" → "Swiggy"
    - "paid to AMAZON" → "Amazon"
  Strip transaction codes (P2M/P2A/CR/DR/numeric ids) and UPI suffixes (@okaxis, @paytm). Title-case obvious all-caps words but keep acronyms (HDFC, IRCTC). null only if truly no counterparty exists (e.g. "balance enquiry").
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
  errorMessage?: string;
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
  errorMessage?: string;
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
): Promise<{
  parsed: T | null;
  raw: string | null;
  error?: GeminiErrorType;
  errorMessage?: string;
}> {
  if (!env.GEMINI_API_KEY) {
    return {
      parsed: null,
      raw: null,
      errorMessage: "GEMINI_API_KEY is not set",
    };
  }

  // AbortController + setTimeout works on every JS runtime; AbortSignal.timeout
  // is not available in some Hermes builds and would throw synchronously.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          errorMessage: "HTTP 503 Service Unavailable",
        };
      }
      if (response.status === 429) {
        return {
          parsed: null,
          raw: null,
          error: GEMINI_ERROR.RATE_LIMITED,
          errorMessage: "HTTP 429 Rate Limited",
        };
      }
      const bodyText = await response.text().catch(() => "");
      return {
        parsed: null,
        raw: null,
        error: GEMINI_ERROR.UNKNOWN,
        errorMessage:
          `HTTP ${response.status} ${response.statusText} ${bodyText}`.slice(
            0,
            300,
          ),
      };
    }

    const data = (await response.json()) as GeminiApiResponse;
    const candidate = data.candidates?.[0];
    const raw: string | null =
      candidate?.content?.parts?.[0]?.text?.trim() ?? null;
    const finishReason: string | undefined = candidate?.finishReason;

    if (finishReason === FINISH_REASON_MAX_TOKENS) {
      return {
        parsed: null,
        raw,
        error: GEMINI_ERROR.TRUNCATED,
        errorMessage: "response truncated (MAX_TOKENS)",
      };
    }

    if (!raw) {
      return {
        parsed: null,
        raw: null,
        error: GEMINI_ERROR.UNKNOWN,
        errorMessage: `empty response (finishReason=${finishReason ?? "unknown"})`,
      };
    }

    try {
      const parsed = JSON.parse(raw) as T;
      return { parsed, raw };
    } catch (parseErr) {
      const message =
        (parseErr as { message?: string } | null)?.message ?? "unknown";
      return {
        parsed: null,
        raw,
        error: GEMINI_ERROR.UNKNOWN,
        errorMessage: `JSON.parse failed: ${message}`,
      };
    }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const message =
      (err as { message?: string } | null)?.message ?? String(err);
    if (name === "AbortError" || name === "TimeoutError") {
      return {
        parsed: null,
        raw: null,
        error: GEMINI_ERROR.TIMEOUT,
        errorMessage: `request timed out after ${GEMINI_TIMEOUT_MS}ms`,
      };
    }
    return {
      parsed: null,
      raw: null,
      error: GEMINI_ERROR.UNKNOWN,
      errorMessage: `fetch failed: ${message}`.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
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
    return {
      parsed: null,
      raw: result.raw,
      error: result.error,
      errorMessage: result.errorMessage,
    };
  }

  const parsed = result.parsed;

  if (!parsed.is_transaction) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: "model returned is_transaction=false",
    };
  }
  if (parsed.amount <= 0) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: `model returned non-positive amount: ${parsed.amount}`,
    };
  }
  if (!DATE_REGEX.test(parsed.date)) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: `model returned invalid date: ${parsed.date}`,
    };
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
    return {
      parsed: null,
      raw: result.raw,
      error: result.error,
      errorMessage: result.errorMessage,
    };
  }

  const parsed = result.parsed;

  if (!parsed.is_transaction) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: "model returned is_transaction=false",
    };
  }
  if (parsed.amount <= 0) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: `model returned non-positive amount: ${parsed.amount}`,
    };
  }
  if (!DATE_REGEX.test(parsed.date)) {
    return {
      parsed: null,
      raw: result.raw,
      errorMessage: `model returned invalid date: ${parsed.date}`,
    };
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

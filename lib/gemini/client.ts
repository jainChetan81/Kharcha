import { GEMINI_ERROR, type GeminiErrorType } from "@/lib/constants";
import { apiFetchAuthed } from "@/lib/device";
import { env } from "@/lib/env";

export type GeminiParsedTransaction = {
  amount: number;
  type: "expense" | "income";
  source?: "UPI" | "credit card" | "debit card" | "other" | null;
  date: string;
  merchant?: string | null;
  category: string;
  is_subscription: boolean;
  billing_day?: number | null;
  confidence: "high" | "medium" | "low";
};

export interface GeminiParseResult {
  parsed: GeminiParsedTransaction | null;
  raw: string | null;
  error?: GeminiErrorType;
  errorMessage?: string;
}

// Backend response mirrors this shape (see kharcha-backend/src/routes/ai.ts)
interface BackendResponse {
  parsed: GeminiParsedTransaction | null;
  raw: string | null;
  error: GeminiErrorType | null;
  errorMessage: string | null;
}

function isKnownError(value: unknown): value is GeminiErrorType {
  if (typeof value !== "string") return false;
  return Object.values(GEMINI_ERROR).includes(value as GeminiErrorType);
}

export async function parseWithGemini(
  text: string,
  categoryNames: string[],
): Promise<GeminiParseResult> {
  try {
    const res = await apiFetchAuthed(`${env.API_URL}/ai/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, categories: categoryNames }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        parsed: null,
        raw: null,
        error: GEMINI_ERROR.UNKNOWN,
        errorMessage: body?.error ?? `HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as BackendResponse;
    return {
      parsed: body.parsed,
      raw: body.raw,
      error: isKnownError(body.error) ? body.error : undefined,
      errorMessage: body.errorMessage ?? undefined,
    };
  } catch (err) {
    const message =
      (err as { message?: string } | null)?.message ?? String(err);
    return {
      parsed: null,
      raw: null,
      error: GEMINI_ERROR.UNKNOWN,
      errorMessage: `network failure: ${message}`.slice(0, 300),
    };
  }
}

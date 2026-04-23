import { GEMINI_ERROR, type GeminiErrorType } from "@/lib/constants";
import { apiFetchAuthed } from "@/lib/device";
import { env } from "@/lib/env";

// Cap the proxy request at 30s. Backend Gemini calls typically return in
// 1–3s; anything longer is a stuck connection or a provider outage. Without
// a timeout the user sees an infinite spinner and can't retry.
const GEMINI_REQUEST_TIMEOUT_MS = 30_000;

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
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    GEMINI_REQUEST_TIMEOUT_MS,
  );

  try {
    const res = await apiFetchAuthed(`${env.API_URL}/ai/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, categories: categoryNames }),
      signal: controller.signal,
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
    // `controller.abort()` surfaces here as a DOMException with name
    // "AbortError" — map it to the existing TIMEOUT error code so the UI
    // already-defined timeout copy kicks in instead of "unknown failure".
    const isAbort =
      (err as { name?: string } | null)?.name === "AbortError" ||
      controller.signal.aborted;
    if (isAbort) {
      return {
        parsed: null,
        raw: null,
        error: GEMINI_ERROR.TIMEOUT,
        errorMessage: `request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000}s`,
      };
    }
    const message =
      (err as { message?: string } | null)?.message ?? String(err);
    return {
      parsed: null,
      raw: null,
      error: GEMINI_ERROR.UNKNOWN,
      errorMessage: `network failure: ${message}`.slice(0, 300),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ERROR_MESSAGES } from "./constants";
import { parseWithGemini } from "./gemini";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

interface AiParseRequest {
  text?: unknown;
  categories?: unknown;
}

// Callable invoked from the app's share-sheet flow when local regex parsers
// miss. Auth is enforced — only signed-in (anonymous) clients of this
// Firebase project can call it.
export const aiParse = onCall(
  {
    region: "asia-south1",
    secrets: [GEMINI_API_KEY],
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }

    const data = (request.data ?? {}) as AiParseRequest;

    if (
      !data.text ||
      typeof data.text !== "string" ||
      data.text.trim().length === 0
    ) {
      throw new HttpsError("invalid-argument", ERROR_MESSAGES.TEXT_REQUIRED);
    }

    const categories = Array.isArray(data.categories)
      ? data.categories.filter((v): v is string => typeof v === "string")
      : [];

    const result = await parseWithGemini(
      GEMINI_API_KEY.value(),
      data.text,
      categories,
    );

    logger.info("[ai-parse] result", {
      ok: !!result.parsed,
      error: result.error ?? null,
    });

    return {
      parsed: result.parsed,
      raw: result.raw,
      error: result.error ?? null,
      errorMessage: result.errorMessage ?? null,
    };
  },
);

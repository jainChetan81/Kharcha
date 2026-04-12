import type { GeminiErrorType } from "@/lib/constants";
import { parseTransactionWithGemini } from "@/lib/gemini/parser";
import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { ICICI_PARSERS } from "./icici";
import { INDUSIND_PARSERS } from "./indusind";
import { KOTAK_PARSERS } from "./kotak";
import { SBI_PARSERS } from "./sbi";
import {
  decodeHtmlEntities,
  type ParsedTransaction,
  type Parser,
  tryParsers,
} from "./utils";

export type { ParsedTransaction };

export type ParseSource = "regex" | "gemini" | "failed";

export interface ParseOutcome {
  parsed: ParsedTransaction | null;
  parsedBy: ParseSource;
  geminiResponse?: string;
  geminiError?: GeminiErrorType;
}

const PARSER_MAP: Record<string, Parser[]> = {
  axis: AXIS_PARSERS,
  hdfc: HDFC_PARSERS,
  icici: ICICI_PARSERS,
  indusind: INDUSIND_PARSERS,
  kotak: KOTAK_PARSERS,
  sbi: SBI_PARSERS,
};

export async function parseEmailWithFallback(
  body: string,
  parserKey: string | null,
): Promise<ParseOutcome> {
  const decoded = decodeHtmlEntities(body);

  if (parserKey && PARSER_MAP[parserKey]) {
    const result = tryParsers(PARSER_MAP[parserKey], decoded);
    if (result) return { parsed: result, parsedBy: "regex" };
  }

  const gemini = await parseTransactionWithGemini(decoded);
  if (gemini.parsed) {
    return {
      parsed: {
        ...gemini.parsed,
        merchant: gemini.parsed.merchant ?? "Unknown",
      },
      parsedBy: "gemini",
      geminiResponse: gemini.raw ?? undefined,
    };
  }

  return {
    parsed: null,
    parsedBy: "failed",
    geminiResponse: gemini.raw ?? undefined,
    geminiError: gemini.error,
  };
}

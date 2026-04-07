import { parseTransactionWithGemini } from "@/lib/gemini/parser";
import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
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
}

const PARSER_MAP: Record<string, Parser[]> = {
  axis: AXIS_PARSERS,
  hdfc: HDFC_PARSERS,
  indusind: INDUSIND_PARSERS,
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
  };
}

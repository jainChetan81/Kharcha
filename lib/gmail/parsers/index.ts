import {
  type GeminiErrorType,
  PARSED_BY,
  type ParsedByType,
} from "@/lib/constants";
import { parseTransactionWithGemini } from "@/lib/gemini/parser";
import { AXIS_PARSERS } from "./axis";
import { CITI_PARSERS } from "./citi";
import { ONECARD_PARSERS, SLICE_PARSERS, UNI_PARSERS } from "./fintech-cards";
import { HDFC_PARSERS } from "./hdfc";
import { HSBC_PARSERS } from "./hsbc";
import { ICICI_PARSERS } from "./icici";
import { IDFC_PARSERS } from "./idfc";
import { INDUSIND_PARSERS } from "./indusind";
import { KOTAK_PARSERS } from "./kotak";
import { SBI_PARSERS } from "./sbi";
import { SC_PARSERS } from "./sc";
import {
  decodeHtmlEntities,
  type ParsedTransaction,
  type Parser,
  tryParsers,
} from "./utils";

export type { ParsedTransaction };

export type ParseSource = ParsedByType | "failed";

export interface ParseOutcome {
  parsed: ParsedTransaction | null;
  parsedBy: ParseSource;
  geminiResponse?: string;
  geminiError?: GeminiErrorType;
}

const PARSER_MAP: Record<string, Parser[]> = {
  axis: AXIS_PARSERS,
  citi: CITI_PARSERS,
  hdfc: HDFC_PARSERS,
  hsbc: HSBC_PARSERS,
  icici: ICICI_PARSERS,
  idfc: IDFC_PARSERS,
  indusind: INDUSIND_PARSERS,
  kotak: KOTAK_PARSERS,
  onecard: ONECARD_PARSERS,
  sbi: SBI_PARSERS,
  sc: SC_PARSERS,
  slice: SLICE_PARSERS,
  uni: UNI_PARSERS,
};

export async function parseEmailWithFallback(
  body: string,
  parserKey: string | null,
  categoryNames: string[],
): Promise<ParseOutcome> {
  const decoded = decodeHtmlEntities(body);

  if (parserKey && PARSER_MAP[parserKey]) {
    const result = tryParsers(PARSER_MAP[parserKey], decoded);
    if (result) return { parsed: result, parsedBy: PARSED_BY.REGEX };
  }

  const gemini = await parseTransactionWithGemini(decoded, categoryNames);
  if (gemini.parsed) {
    return {
      parsed: {
        ...gemini.parsed,
        merchant: gemini.parsed.merchant ?? "Unknown",
      },
      parsedBy: PARSED_BY.GEMINI,
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

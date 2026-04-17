import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
import type { ParsedTransaction } from "./types";

const ALL_PARSERS = [...AXIS_PARSERS, ...HDFC_PARSERS, ...INDUSIND_PARSERS];

/**
 * Try to parse a bank SMS/notification using regex parsers.
 * Returns null if no parser matched — caller should fall back to Gemini.
 */
export function parseMessage(text: string): ParsedTransaction | null {
  for (const parser of ALL_PARSERS) {
    const result = parser(text);
    if (result) return result;
  }
  return null;
}

export type { ParsedTransaction } from "./types";

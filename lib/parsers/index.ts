import { ALL_EMAIL_PARSERS } from "@/lib/gmail/parsers";
import { tryParsers as tryEmailParsers } from "@/lib/gmail/parsers/utils";
import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
import type { ParsedTransaction } from "./types";
import { today } from "./utils";

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

  // Second tier: the Gmail regex parsers cover 13 bank/fintech identities
  // vs. the 3 above, and work unmodified on pasted text now that every one
  // is guarded (see lib/gmail/parsers/utils.ts's isNonTransactionNotice).
  // Best-effort, not full parity — several gate on the bank's full name
  // appearing in the text (e.g. "ICICI"), which a real SMS doesn't always
  // spell out. Gemini remains the final fallback for anything these miss.
  const emailResult = tryEmailParsers(ALL_EMAIL_PARSERS, text);
  if (emailResult) {
    const { type } = emailResult;
    if (type !== "investment") {
      return {
        amount: emailResult.amount,
        merchant: emailResult.merchant,
        date: emailResult.date ?? today(),
        type,
      };
    }
  }

  return null;
}

export type { ParsedTransaction } from "./types";

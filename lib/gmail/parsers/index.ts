import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
import {
  decodeHtmlEntities,
  type ParsedTransaction,
  tryParsers,
} from "./utils";

export type { ParsedTransaction };

export function parseEmail(
  from: string,
  body: string,
): ParsedTransaction | null {
  const decoded = decodeHtmlEntities(body);
  if (from.includes("axis")) return tryParsers(AXIS_PARSERS, decoded);
  if (from.includes("hdfc")) return tryParsers(HDFC_PARSERS, decoded);
  if (from.includes("indusind")) return tryParsers(INDUSIND_PARSERS, decoded);
  return null;
}

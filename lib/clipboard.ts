import * as Clipboard from "expo-clipboard";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export async function copyToClipboard(value: string, label: string) {
  try {
    await Clipboard.setStringAsync(value);
    showSuccessToast(`${label} copied`);
  } catch {
    showErrorToast("Copy failed", "Could not access clipboard");
  }
}

// Mask common PII patterns in bank email snippets before the user copies
// them to the system clipboard (other apps can read clipboard contents).
// Covers: full/partial card numbers, account numbers, OTPs, and CVVs.
export function maskSensitivePii(text: string): string {
  return (
    text
      // 13–19 digit card numbers with optional spaces/dashes
      .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[card]")
      // "ending 1234" / "ending with 1234" / "XX1234" / "xxxx1234"
      .replace(/\b(ending(?:\s+with)?)\s+\d{4,6}\b/gi, "$1 ****")
      .replace(/\b[Xx]{2,}\s?\d{3,6}\b/g, "****")
      // Account / A/c numbers: "A/c 1234567890" or "account no. 123456"
      .replace(
        /\b(a\/?c|acct|account)(?:\s+(?:no\.?|number))?[:\s]+\d{4,}\b/gi,
        "$1 ****",
      )
      // "OTP is 123456" / "OTP: 1234"
      .replace(/\b(otp|cvv)(?:\s+is)?[:\s]+\d{3,8}\b/gi, "$1 ****")
  );
}

export async function copyMaskedToClipboard(value: string, label: string) {
  return copyToClipboard(maskSensitivePii(value), label);
}

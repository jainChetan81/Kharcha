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
// Covers: full/partial card numbers, account numbers, UPI IDs, phone
// numbers, OTPs, and CVVs.
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
      // UPI IDs: handle@provider (e.g. foo@okhdfcbank, 9876543210@upi).
      // Intentionally broad — matches any email-shaped token, which also
      // catches sender addresses in the snippet. Acceptable because users
      // don't need sender emails in a clipboard copy.
      .replace(/\b[\w.-]{2,}@[a-z][a-z0-9.-]{1,}\b/gi, "[upi]")
      // Indian mobile numbers: 10-digit starting 6–9, optional +91 prefix.
      .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[phone]")
      // "OTP is 123456" / "OTP: 1234"
      .replace(/\b(otp|cvv)(?:\s+is)?[:\s]+\d{3,8}\b/gi, "$1 ****")
  );
}

export async function copyMaskedToClipboard(value: string, label: string) {
  return copyToClipboard(maskSensitivePii(value), label);
}

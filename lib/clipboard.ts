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

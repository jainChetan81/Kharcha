import { Alert } from "react-native";

// IMPORTANT: Expo inlines process.env.EXPO_PUBLIC_* at build time via Babel.
// This ONLY works with literal property access (process.env.EXPO_PUBLIC_FOO).
// Dynamic access like process.env[key] will be undefined in production builds.

function warnIfMissing(name: string, value: string): string {
  if (!value) {
    Alert.alert("Missing Environment Variable", `${name} is not set.`);
  }
  return value;
}

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
// Deliberate trade-off: this key ships in the client bundle (EXPO_PUBLIC_* is
// inlined into the JS, so it is extractable from the IPA/APK). Acceptable ONLY
// as a key restricted in Google Cloud to the Generative Language API + this
// app's bundle id / package name. If this app ever gets a public
// (non-internal) release, move Gemini calls behind an authed proxy first.
// AI parsing is optional — a missing key degrades gracefully
// (callGemini returns NO_API_KEY), so we don't block startup with an alert.
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
// Mini sync (personal Mac mini pipeline). Optional — if either value is
// empty, the feature is treated as not configured and degrades to a no-op.
// MINI_API_TOKEN ships in the client bundle exactly like GEMINI_API_KEY
// above (EXPO_PUBLIC_* is inlined into the JS, extractable from a built
// IPA/APK) — and it is the more dangerous of the two secrets: it grants
// both read access (GET /transactions returns the full parsed SMS /
// transaction history, lib/mini-sync.ts's fetchMiniTransactions) and write
// access (POST /transactions can push fabricated rows, pushTransactionToMini)
// to the user's personal sync pipeline, not just a rate-limited AI call.
// Acceptable ONLY because the mini server is tailnet-only — "the mini is
// canonical, the app is a client, nothing is exposed off the tailnet"
// (docs/V3_SPEC.md) — a leaked token is unusable to anyone not already on
// that Tailscale network. If the mini is ever exposed off-tailnet, this
// token needs real scoping (short-lived, rotatable) before that happens.
const MINI_API_URL = process.env.EXPO_PUBLIC_MINI_API_URL ?? "";
const MINI_API_TOKEN = process.env.EXPO_PUBLIC_MINI_API_TOKEN ?? "";
export const env = {
  GOOGLE_IOS_CLIENT_ID: warnIfMissing(
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
    GOOGLE_IOS_CLIENT_ID,
  ),
  GOOGLE_WEB_CLIENT_ID: warnIfMissing(
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    GOOGLE_WEB_CLIENT_ID,
  ),
  GEMINI_API_KEY,
  MINI_API_URL,
  MINI_API_TOKEN,
} as const;

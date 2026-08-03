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
// Mini sync (personal Mac mini pipeline). Optional — if the URL is empty the
// feature is treated as not configured and degrades to a no-op.
// The URL is committed rather than kept in .env.local: it is a Tailscale
// MagicDNS name resolvable only from inside this tailnet, so it discloses
// nothing usable to a reader of this repo, and hardcoding it means a fresh
// checkout needs no configuration at all. Override via
// EXPO_PUBLIC_MINI_API_URL when pointing at a different host.
// There is no token: the mini dropped bearer auth entirely (kharcha-mini
// f2ceec3, df2d3ac). Every route is open and an Authorization header is
// ignored rather than validated. The tailnet boundary is now the whole of
// the access control — reachability is authorisation. If the mini is ever
// exposed off the tailnet, it needs real auth again before that happens,
// and this app needs a credential to send with it.
const DEFAULT_MINI_API_URL = "https://mini.bullhead-mine.ts.net:8300";
const MINI_API_URL =
  process.env.EXPO_PUBLIC_MINI_API_URL || DEFAULT_MINI_API_URL;
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
} as const;

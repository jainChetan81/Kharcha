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
// The URL is committed rather than kept in .env.local: it is a Tailscale
// MagicDNS name resolvable only from inside this tailnet, so it discloses
// nothing usable to a reader of this (public) repo, and hardcoding it means
// a fresh checkout only has to supply the token. Override via
// EXPO_PUBLIC_MINI_API_URL when pointing at a different host.
// The token is committed too, by explicit owner decision: this is a
// single-tenant personal system and the operational cost of keeping it in
// .env.local outweighed the risk for the owner. Know what that trades away
// before copying this pattern. The token grants both read (GET
// /transactions returns the full parsed SMS / transaction history,
// lib/mini-sync.ts's fetchMiniTransactions) and write (POST /transactions
// can push fabricated rows, pushTransactionToMini) access to the personal
// pipeline. It also ships in the client bundle regardless, exactly like
// GEMINI_API_KEY above (EXPO_PUBLIC_* is inlined into the JS and is
// extractable from a built IPA/APK), so a determined reader of a release
// build could recover it either way.
// What contains the blast radius is that the mini is tailnet-only — "the
// mini is canonical, the app is a client, nothing is exposed off the
// tailnet" (docs/V3_SPEC.md) — so the token is inert to anyone not already
// on this Tailscale network. Two things therefore MUST hold: this repo's
// visibility and the tailnet boundary. If the mini is ever exposed off the
// tailnet, rotate this token and move it behind real scoping (short-lived,
// rotatable) BEFORE that happens.
const DEFAULT_MINI_API_URL = "https://mini.bullhead-mine.ts.net:8300";
const MINI_API_URL =
  process.env.EXPO_PUBLIC_MINI_API_URL || DEFAULT_MINI_API_URL;
const DEFAULT_MINI_API_TOKEN =
  "79d6c23c8dfa2913396847b8a3ad0cd3b005a241206ad49af091d823c4629283";
const MINI_API_TOKEN =
  process.env.EXPO_PUBLIC_MINI_API_TOKEN || DEFAULT_MINI_API_TOKEN;
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

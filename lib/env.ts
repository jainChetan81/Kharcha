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
const GOOGLE_CLIENT_SECRET =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET ?? "";

export const env = {
  GOOGLE_IOS_CLIENT_ID: warnIfMissing(
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
    GOOGLE_IOS_CLIENT_ID,
  ),
  GOOGLE_WEB_CLIENT_ID: warnIfMissing(
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    GOOGLE_WEB_CLIENT_ID,
  ),
  GOOGLE_CLIENT_SECRET: warnIfMissing(
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET",
    GOOGLE_CLIENT_SECRET,
  ),
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "",
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "",
} as const;

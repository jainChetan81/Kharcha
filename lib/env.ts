import { Alert } from "react-native";

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    Alert.alert("Missing Environment Variable", `${key} is not set.`);
    return "";
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  GOOGLE_IOS_CLIENT_ID: required("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
  GOOGLE_WEB_CLIENT_ID: required("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET"),
  API_URL: optional("EXPO_PUBLIC_API_URL", ""),
} as const;

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env variable: ${key}`);
  }
  return value;
}

export const env = {
  GOOGLE_IOS_CLIENT_ID: required("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
  GOOGLE_WEB_CLIENT_ID: required("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: required("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET"),
} as const;

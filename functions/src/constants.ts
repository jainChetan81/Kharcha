export const TRANSACTION_TYPE = {
  INCOME: "income",
  EXPENSE: "expense",
} as const;

export type TransactionType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const SOURCE_TYPE = {
  SYNCED: "synced",
} as const;

export const ERROR_MESSAGES = {
  INVALID_WEBHOOK_TOKEN: "Invalid webhook token",
  DEVICE_NOT_FOUND: "Device not found",
  MISSING_FIELDS: "Missing fields",
  NOT_FORWARDING_ADDRESS: "Not a forwarding address",
  UNPARSEABLE_EMAIL: "Could not parse transaction",
  OTP_EMAIL: "OTP email",
  TEXT_REQUIRED: "text is required",
} as const;

export const GEMINI_MAX_CHARS = 4000;

export const GEMINI_ERROR = {
  SERVICE_UNAVAILABLE: "service_unavailable",
  RATE_LIMITED: "rate_limited",
  TIMEOUT: "timeout",
  TRUNCATED: "truncated",
  NO_API_KEY: "no_api_key",
  NOT_TRANSACTION: "not_transaction",
  UNKNOWN: "unknown",
} as const;

export type GeminiErrorType = (typeof GEMINI_ERROR)[keyof typeof GEMINI_ERROR];

export const EMAIL_TOKEN_LENGTH = 16;
export const EMAIL_PREFIX = "sync+";

export const COLLECTIONS = {
  DEVICES: "devices",
  TRANSACTIONS: "transactions",
} as const;

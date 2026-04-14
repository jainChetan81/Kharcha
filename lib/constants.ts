export const SCREENS = {
  HOME: "/",
  ADD: "/add",
  HISTORY: "/history",
  CONFIG: "/config",
  ABOUT: "/about",
  PROFILE: "/profile",
  BUDGETS: "/budgets",
  SUBSCRIPTIONS: "/subscriptions",
  EDIT: "/edit",
  EDIT_SUBSCRIPTION: "/edit-subscription",
  GMAIL_SYNC: "/gmail-sync",
  DEVICE_SYNC: "/settings/sync",
  BANKS: "/settings/banks",
  NETWORK_LOGS: "/network-logs",
  EXPORT: "/export",
  SUBSCRIPTION_AUDIT: "/subscriptions/audit",
} as const;

export const BUNDLE_ID = "com.chetanjain.kharcha" as const;
export const OAUTH_REDIRECT_PATH = "oauthredirect" as const;

export function editScreen(id: number) {
  return `${SCREENS.EDIT}/${id}` as const;
}

export function editSubscriptionScreen(id: number) {
  return `${SCREENS.EDIT_SUBSCRIPTION}/${id}` as const;
}

export const DB_NAME = "kharcha.db";

export const PAGE_SIZE = 10;

export const DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm";
export const DATE_ISO_FORMAT = "yyyy-MM-dd";
export const MONTH_FORMAT = "yyyy-MM";
export const DATE_FORMAT = "dd MMM yyyy";
export const TIME_FORMAT = "hh:mm a";
export const DATE_DISPLAY_FORMAT = `${DATE_FORMAT}, ${TIME_FORMAT}`;
export const CSV_DATE_FORMAT = "dd/MM/yyyy";
export const CSV_TIME_FORMAT = "HH:mm";

export const TRANSACTION_TYPE = {
  ALL: "all",
  EXPENSE: "expense",
  INCOME: "income",
  TRANSFER: "transfer",
} as const;

export type TransactionFilterType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const SOURCE_TYPE = {
  ALL: "all",
  MANUAL: "manual",
  SYNCED: "synced",
  RECURRING: "recurring",
  TRANSFER: "transfer",
} as const;

export type SourceFilterType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];
export type SourceType = Exclude<SourceFilterType, "all">;

export const PERIOD_PRESET = {
  CUSTOM: "custom",
  TODAY: "today",
  THIS_WEEK: "this_week",
  LAST_7_DAYS: "last_7_days",
  THIS_MONTH: "this_month",
  LAST_MONTH: "last_month",
  THIS_YEAR: "this_year",
} as const;

export type PeriodPresetType =
  (typeof PERIOD_PRESET)[keyof typeof PERIOD_PRESET];

export const TOAST_TYPE = {
  SUCCESS: "success",
  ERROR: "error",
  UNDO: "undo",
} as const;

export const COLORS = {
  PRIMARY: "#7c3aed",
  WARNING: "#f59e0b",
  DANGER: "#ef4444",
  POSITIVE: "#22c55e",
  BAR_BG: "#2a2a2a",
  BACKGROUND: "#0a0a0a",
  MUTED: "#888888",
  FOREGROUND: "#f0f0f0",
  WHITE: "#ffffff",
  BADGE_BLUE: "#1d4ed8",
  SHADOW: "#000000",
} as const;

export const LABELS = {
  AVAILABLE: "available",
  SPENT: "spent",
  NO_DATA: "no data",
} as const;

export const GMAIL_API = {
  MESSAGES: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  PROFILE: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
} as const;

export const CONFIG_KEYS = {
  CURRENCY: "currency",
  USER_NAME: "userName",
  APP_VERSION: "app_version",
  SCHEMA_VERSION: "schema_version",
  GMAIL_CONNECTED: "gmail_connected",
  GMAIL_LAST_SYNCED_AT: "gmail_last_synced_at",
  GMAIL_EMAILS_FETCHED: "gmail_emails_fetched",
  GMAIL_TRANSACTIONS_ADDED: "gmail_transactions_added",
  DEVICE_ID: "device_id",
  BACKEND_FORWARDING_EMAIL: "backend_forwarding_email",
  BACKEND_LAST_SYNCED_AT: "backend_last_synced_at",
  APP_LOCK_ENABLED: "app_lock_enabled",
} as const;

export const SUBSCRIPTION_NOTE = "Auto-created from subscription";
export const GMAIL_SYNC_NOTE = "synced from gmail";

export const OTHER_CATEGORY_LABEL = "Other";

export const DEVICE_TYPE_NAME: Record<number, string> = {
  0: "Unknown",
  1: "Phone",
  2: "Tablet",
  3: "Desktop",
  4: "TV",
};

export const EMAIL_LOG_STATUS = {
  ADDED: "added",
  DUPLICATE: "duplicate",
  FAILED: "failed",
  NOT_TRANSACTION: "not_transaction",
} as const;

export type EmailLogStatusType =
  (typeof EMAIL_LOG_STATUS)[keyof typeof EMAIL_LOG_STATUS];

export const EMAIL_LOG_REASON = {
  GEMINI_UNAVAILABLE: "gemini_unavailable",
  GEMINI_TIMEOUT: "gemini_timeout",
  GEMINI_TRUNCATED: "gemini_truncated",
  NO_PARSER_MATCHED: "no parser matched",
} as const;

export type EmailLogReasonType =
  (typeof EMAIL_LOG_REASON)[keyof typeof EMAIL_LOG_REASON];

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

export const PARSED_BY = {
  REGEX: "regex",
  GEMINI: "gemini",
} as const;

export type ParsedByType = (typeof PARSED_BY)[keyof typeof PARSED_BY];

export const QUERY_KEYS = {
  TRANSACTION: "transaction",
  TRANSACTIONS: "transactions",
  TRANSACTIONS_PAGINATED: "transactions-paginated",
  MONTHLY_SUMMARY: "monthly-summary",
  CATEGORY_BREAKDOWN: "category-breakdown",
  MONTHLY_INSIGHTS: "monthly-insights",
  CATEGORIES: "categories",
  SOURCES: "sources",
  DATA_STATS: "data-stats",
  CONFIG: "config",
  BUDGETS: "budgets",
  SUBSCRIPTIONS: "subscriptions",
  FEATURE_FLAGS: "feature-flags",
  BANKS: "banks",
} as const;

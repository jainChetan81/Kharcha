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
export const DATE_FORMAT = "dd MMM yyyy";
export const TIME_FORMAT = "hh:mm a";
export const DATE_DISPLAY_FORMAT = `${DATE_FORMAT}, ${TIME_FORMAT}`;

export const TRANSACTION_TYPE = {
  ALL: "all",
  EXPENSE: "expense",
  INCOME: "income",
} as const;

export type TransactionFilterType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const SOURCE_TYPE = {
  ALL: "all",
  MANUAL: "manual",
  SYNCED: "synced",
  RECURRING: "recurring",
} as const;

export type SourceFilterType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];
export type SourceType = Exclude<SourceFilterType, "all">;

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
} as const;

export const SUBSCRIPTION_NOTE = "Auto-created from subscription";
export const GMAIL_SYNC_NOTE = "synced from gmail";

export const BANK_SENDERS = [
  "alerts@axis.bank.com",
  "alerts@axis.bank.in",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
  "alerts@hdfcbank.bank.in",
  "indusind_bank@indusind.com",
] as const;

export const DEVICE_TYPE_NAME: Record<number, string> = {
  0: "Unknown",
  1: "Phone",
  2: "Tablet",
  3: "Desktop",
  4: "TV",
};

export const QUERY_KEYS = {
  TRANSACTION: "transaction",
  TRANSACTIONS: "transactions",
  TRANSACTIONS_PAGINATED: "transactions-paginated",
  MONTHLY_SUMMARY: "monthly-summary",
  CATEGORY_BREAKDOWN: "category-breakdown",
  CATEGORIES: "categories",
  SOURCES: "sources",
  DATA_STATS: "data-stats",
  CONFIG: "config",
  BUDGETS: "budgets",
  SUBSCRIPTIONS: "subscriptions",
  FEATURE_FLAGS: "feature-flags",
} as const;

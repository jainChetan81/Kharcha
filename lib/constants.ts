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
export const DATE_DISPLAY_FORMAT = "dd MMM yyyy, hh:mm a";

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
} as const;

export const LABELS = {
  AVAILABLE: "available",
  SPENT: "spent",
  NO_DATA: "no data",
} as const;

export const GMAIL_API = {
  BASE: "https://gmail.googleapis.com/gmail/v1/users/me",
  MESSAGES: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
} as const;

export const BANK_SENDERS = [
  "alerts@axis.bank.com",
  "alerts@axis.bank.in",
  "alerts@hdfcbank.net",
  "alerts@hdfcbank.com",
  "alerts@hdfcbank.bank.in",
  "indusind_bank@indusind.com",
] as const;

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
} as const;

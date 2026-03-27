// --- Routes ---
export const SCREENS = {
  HOME: "/",
  ADD: "/add",
  HISTORY: "/history",
  SETTINGS: "/settings",
} as const;

// --- Pagination ---
export const PAGE_SIZE = 10;

// --- Date Formats ---
export const DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm";
export const DATE_DISPLAY_FORMAT = "dd MMM yyyy, hh:mm a";

// --- Transaction Types ---
export const TRANSACTION_TYPE = {
  ALL: "all",
  EXPENSE: "expense",
  INCOME: "income",
} as const;

export type TransactionFilterType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

// --- Query Keys ---
export const QUERY_KEYS = {
  TRANSACTIONS: "transactions",
  TRANSACTIONS_PAGINATED: "transactions-paginated",
  MONTHLY_SUMMARY: "monthly-summary",
  CATEGORIES: "categories",
  SOURCES: "sources",
} as const;

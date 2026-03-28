export const SCREENS = {
  HOME: "/",
  ADD: "/add",
  HISTORY: "/history",
  SETTINGS: "/settings",
  ABOUT: "/about",
  PROFILE: "/profile",
  BUDGETS: "/budgets",
  EDIT: "/edit",
} as const;

export function editScreen(id: number) {
  return `${SCREENS.EDIT}/${id}` as const;
}

export const DB_NAME = "kharcha.db";
export const UNDO_TIMEOUT_MS = 5000;

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

export const TOAST_TYPE = {
  SUCCESS: "success",
  ERROR: "error",
  UNDO: "undo",
} as const;

export const COLORS = {
  PRIMARY: "#7c3aed",
  WARNING: "#f59e0b",
  DANGER: "#ef4444",
  BAR_BG: "#2a2a2a",
} as const;

export const QUERY_KEYS = {
  TRANSACTION: "transaction",
  TRANSACTIONS: "transactions",
  TRANSACTIONS_PAGINATED: "transactions-paginated",
  MONTHLY_SUMMARY: "monthly-summary",
  CATEGORY_BREAKDOWN: "category-breakdown",
  CATEGORIES: "categories",
  SOURCES: "sources",
  DATA_STATS: "data-stats",
  SETTINGS: "settings",
  BUDGETS: "budgets",
} as const;

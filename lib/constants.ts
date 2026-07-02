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
  BANKS: "/settings/banks",
  TAGS: "/config/tags",
  CONFIG_EXPENSE_CATEGORIES: "/config/expense-categories",
  CONFIG_INCOME_CATEGORIES: "/config/income-categories",
  CONFIG_SOURCES: "/config/sources",
  CONFIG_CURRENCY: "/config/currency",
  EXPORT: "/export",
  REIMBURSEMENTS: "/reimbursements",
  PORTFOLIO: "/portfolio",
  HOLDING: "/holding",
  INSIGHTS: "/insights",
  TAG: "/tag",
} as const;

export function holdingScreen(id: number) {
  return `${SCREENS.HOLDING}/${id}` as const;
}

export function tagScreen(id: number) {
  return `${SCREENS.TAG}/${id}` as const;
}

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
  INVESTMENT: "investment",
} as const;

export const INVESTMENT_KIND = {
  BUY: "buy",
  SELL: "sell",
  DIVIDEND: "dividend",
  INTEREST: "interest",
} as const;

export type InvestmentKindType =
  (typeof INVESTMENT_KIND)[keyof typeof INVESTMENT_KIND];

export const INSTRUMENT_TYPE = {
  STOCK: "stock",
  MUTUAL_FUND: "mutual_fund",
  ETF: "etf",
  FD: "fd",
  PPF: "ppf",
  GOLD: "gold",
  CRYPTO: "crypto",
  BOND: "bond",
  OTHER: "other",
} as const;

export type InstrumentTypeType =
  (typeof INSTRUMENT_TYPE)[keyof typeof INSTRUMENT_TYPE];

export const INSTRUMENT_LABEL: Record<InstrumentTypeType, string> = {
  stock: "Stock",
  mutual_fund: "Mutual Fund",
  etf: "ETF",
  fd: "FD",
  ppf: "PPF",
  gold: "Gold",
  crypto: "Crypto",
  bond: "Bond",
  other: "Other",
};

/**
 * Instruments that don't expose a unit count to the user (lump-sum corpus).
 * The add/edit form hides the Units field and the recompute reducer treats
 * every Buy as a pure capital contribution, leaving `units` and `avg_cost`
 * pinned at 0 on the holding row.
 */
export const UNITLESS_INSTRUMENTS: readonly InstrumentTypeType[] = [
  INSTRUMENT_TYPE.FD,
  INSTRUMENT_TYPE.PPF,
  INSTRUMENT_TYPE.BOND,
];

export function isUnitlessInstrument(kind: InstrumentTypeType): boolean {
  return UNITLESS_INSTRUMENTS.includes(kind);
}

export type TransactionFilterType =
  (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

export const REIMBURSEMENT_STATUS = {
  NONE: "none",
  PENDING: "pending",
  REIMBURSED: "reimbursed",
} as const;

export type ReimbursementStatusType =
  (typeof REIMBURSEMENT_STATUS)[keyof typeof REIMBURSEMENT_STATUS];

export const REIMBURSEMENT_FILTER = {
  ALL: "all",
  PENDING: "pending",
  REIMBURSED: "reimbursed",
} as const;

export type ReimbursementFilterType =
  (typeof REIMBURSEMENT_FILTER)[keyof typeof REIMBURSEMENT_FILTER];

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
} as const;

export const TOAST_COPY = {
  ALREADY_EXISTS: "Already exists — kept existing",
} as const;

export const TAG_SCOPE_COPY = {
  scopeStarted: (name: string) => `#${name} scope started`,
  scopeEnded: (name: string) => `#${name} scope ended`,
  failedToStart: "Failed to start scope",
  failedToSchedule: "Failed to schedule scope",
  failedToUpdate: "Failed to update schedule",
  failedToUpdateTag: "Failed to update tag",
  failedToEnd: "Couldn't end scope",
} as const;

export const INLINE_ADD_COPY = {
  CATEGORY: {
    titleExpense: "New Expense Category",
    titleIncome: "New Income Category",
    placeholder: "Category name",
    submitLabel: "Add Category",
    addedToast: "Category added",
    existingToast: "Selected existing category",
    errorTitle: "Failed to add category",
  },
  SOURCE: {
    title: "New Source",
    placeholder: "e.g. HDFC Credit, Paytm, UPI",
    submitLabel: "Add Source",
    addedToast: "Source added",
    existingToast: "Selected existing source",
    errorTitle: "Failed to add source",
  },
  HOLDING: {
    title: "New Holding",
    placeholder: "e.g. Nippon Small Cap, NIFTYBEES",
    submitLabel: "Add Holding",
    addedToast: "Holding added",
    existingToast: "Selected existing holding",
    errorTitle: "Failed to add holding",
  },
} as const;

export const COLORS = {
  PRIMARY: "#7c3aed",
  WARNING: "#f59e0b",
  DANGER: "#cf4e4e",
  POSITIVE: "#2ea262",
  BAR_BG: "#2a2a2a",
  BACKGROUND: "#0a0a0a",
  CARD: "#1a1a1a",
  MUTED: "#888888",
  FOREGROUND: "#f0f0f0",
  WHITE: "#ffffff",
  BADGE_BLUE: "#1d4ed8",
  SHADOW: "#000000",
} as const;

// Muted jewel palette: brand purple leads at full strength, remaining hues
// sit at 70% alpha so they stay distinguishable as categories without
// shouting against the dark card or fighting semantic red / green / amber.
export const CATEGORY_PALETTE: readonly `#${string}`[] = [
  "#7c3aed",
  "#0891b2b3",
  "#d97706b3",
  "#6366f1b3",
  "#e11d48b3",
  "#059669b3",
  "#64748bb3",
];

// Tag tint palette — each picker swatch maps to a hex stored in tags.color
// and used to tint the tag chip in lists and transaction items. Kept in
// sync conceptually with CATEGORY_PALETTE but at full alpha so chip text
// stays legible on dark cards.
export const TAG_COLOR_PALETTE: readonly `#${string}`[] = [
  "#7c3aed",
  "#0891b2",
  "#d97706",
  "#6366f1",
  "#e11d48",
  "#059669",
  "#64748b",
] as const;

export const SHADOWS = {
  TOAST: {
    elevation: 6,
    shadowColor: COLORS.SHADOW,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  FAB: {
    elevation: 10,
    shadowColor: COLORS.SHADOW,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
} as const;

export const LABELS = {
  AVAILABLE: "available",
  SPENT: "spent",
  NO_DATA: "no data",
  TOTAL_INVESTED: "Total Invested",
} as const;

export const GMAIL_API = {
  MESSAGES: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  PROFILE: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
} as const;

export const CONFIG_KEYS = {
  APP_ID: "app_id",
  CURRENCY: "currency",
  USER_NAME: "userName",
  GMAIL_CONNECTED: "gmail_connected",
  GMAIL_LAST_SYNCED_AT: "gmail_last_synced_at",
  APP_LOCK_ENABLED: "app_lock_enabled",
  AI_HINT_DISMISSED: "ai_hint_dismissed",
  CLOUD_BACKUP_ENABLED: "cloud_backup_enabled",
  CLOUD_BACKUP_LAST_AT: "cloud_backup_last_at",
  CLOUD_BACKUP_LAST_FILE_ID: "cloud_backup_last_file_id",
  GMAIL_SYNC_USER_ENABLED: "gmail_sync_user_enabled",
  LAST_WRAP_SHOWN_MONTH: "last_wrap_shown_month",
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
  DECODE_ERROR: "email body decode failed",
  EMPTY_BODY: "empty email body",
} as const;

export type EmailLogReasonType =
  (typeof EMAIL_LOG_REASON)[keyof typeof EMAIL_LOG_REASON];

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

export const PARSED_BY = {
  REGEX: "regex",
  GEMINI: "gemini",
} as const;

export type ParsedByType = (typeof PARSED_BY)[keyof typeof PARSED_BY];

export const QUERY_KEYS = {
  TRANSACTION: "transaction",
  TRANSACTIONS: "transactions",
  TRANSACTIONS_PAGINATED: "transactions-paginated",
  TRANSACTIONS_SEARCH: "transactions-search",
  MONTHLY_SUMMARY: "monthly-summary",
  CATEGORY_BREAKDOWN: "category-breakdown",
  MERCHANT_BREAKDOWN: "merchant-breakdown",
  TOTAL_MONTHLY_BUDGET: "total-monthly-budget",
  MONTHLY_INSIGHTS: "monthly-insights",
  FILTERED_INSIGHTS: "filtered-insights",
  CATEGORIES: "categories",
  SOURCES: "sources",
  DATA_STATS: "data-stats",
  CONFIG: "config",
  BUDGETS: "budgets",
  SUBSCRIPTIONS: "subscriptions",
  BANKS: "banks",
  REIMBURSEMENT_SUMMARY: "reimbursement-summary",
  TAGS: "tags",
  TAG_BREAKDOWN: "tag-breakdown",
  TAG_BREAKDOWN_ALL_TIME: "tag-breakdown-all-time",
  TAG_STATS: "tag-stats",
  TAG_SUGGESTIONS: "tag-suggestions",
  ACTIVE_TAG: "active-tag",
  MERCHANT_SUGGESTIONS: "merchant-suggestions",
  HOLDINGS: "holdings",
  HOLDING: "holding",
  HOLDING_TRANSACTIONS: "holding-transactions",
  PORTFOLIO_SUMMARY: "portfolio-summary",
  CLOUD_BACKUP: "cloud-backup",
  USER_SYNC_PREFS: "user-sync-prefs",
  BIGGEST_TRANSACTION: "biggest-transaction",
  TRANSACTION_COUNT: "transaction-count",
  TRACKING_STREAK: "tracking-streak",
  DAILY_SPEND: "daily-spend",
} as const;

export const BOOL_FLAG = {
  ON: "1",
  OFF: "0",
} as const;

// Layout
export const SCROLL_BOTTOM_PADDING = { paddingBottom: 60 } as const;
export const SHEET_MAX_HEIGHT_FRACTION = 0.65;

// Gmail sync
export const GMAIL_SYNC_MAX_MONTHS_BACK = 1;

// Thresholds
export const BUDGET_CRITICAL_THRESHOLD = 0.9;

// Display limits
export const TAG_DISPLAY_LIMIT = 3;
export const TOP_BREAKDOWN_LIMIT = 5;
export const RECENT_TRANSACTIONS_LIMIT = 5;
export const MAX_EXPORT_TRANSACTIONS = 10_000;

// Animation
export const ANIMATION_DURATION_MS = 200;

// Auto-detect subscriptions
// Window we look back for repeat charges, the minimum count of charges to
// flag as recurring, the minimum distinct calendar months they must span
// (filters out a flurry of same-day duplicates), and the ± price tolerance
// (15% covers tiny tax/exchange-rate jitter without grouping unrelated
// charges).
export const RECURRING_DETECTION_DAYS = 90;
export const RECURRING_DETECTION_MIN_HITS = 2;
export const RECURRING_DETECTION_MIN_MONTHS = 2;
export const RECURRING_DETECTION_PRICE_TOLERANCE = 0.15;

// Category slugs
export const CATEGORY_SLUG = {
  OTHER: "other",
} as const;

// Source defaults
export const DEFAULT_SOURCE_NAME = "upi";

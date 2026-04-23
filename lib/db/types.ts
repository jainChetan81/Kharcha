import type { InferSelectModel } from "drizzle-orm";
import type {
  bankEmails,
  banks,
  categories,
  config,
  sources,
  subscriptions,
  tags,
  transactions,
} from "./schema";

export type Category = InferSelectModel<typeof categories>;
export type Source = InferSelectModel<typeof sources>;
export type Transaction = InferSelectModel<typeof transactions>;
export type Subscription = InferSelectModel<typeof subscriptions>;
export type ConfigRow = InferSelectModel<typeof config>;
export type Bank = InferSelectModel<typeof banks>;
export type BankEmail = InferSelectModel<typeof bankEmails>;
export type BankWithEmails = Bank & { emails: BankEmail[] };
export type Tag = InferSelectModel<typeof tags>;

export type TagLite = { id: number; name: string };

export type TransactionRow = Transaction & {
  category_name: string | null;
  source_name: string | null;
  destination_source_name: string | null;
  source_type: "manual" | "synced" | "recurring" | "transfer";
  parsed_by: "regex" | "gemini" | null;
  reimbursement_status: "none" | "pending" | "reimbursed";
  reimbursed_at: string | null;
  tags: TagLite[];
};

export type ReimbursementSummary = {
  pending_count: number;
  pending_total: number;
  reimbursed_count: number;
  reimbursed_total: number;
};

export type TagBreakdownRow = {
  tag_id: number;
  tag_name: string;
  total: number;
  count: number;
  percentage: number;
};

export type MonthlySummary = {
  total_income: number;
  total_expenses: number;
};

export type CategoryBreakdownRow = {
  category_id: number | null;
  category_name: string;
  total: number;
  count: number;
  percentage: number;
};

export type MerchantBreakdownRow = {
  merchant: string;
  total: number;
  count: number;
  percentage: number;
};

export type SubscriptionRow = Subscription & {
  category_name: string | null;
  source_name: string | null;
};

export type BudgetRow = {
  category_id: number;
  category_name: string;
  amount: number;
};

export type MonthlyInsights = {
  topCategoryChange: {
    category: string;
    categoryId: number | null;
    percent: number;
    direction: "up" | "down";
  } | null;
  projectedLow: number | null;
  projectedHigh: number | null;
  daysElapsed: number;
  daysInMonth: number;
};

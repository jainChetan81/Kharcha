import type { InferSelectModel } from "drizzle-orm";
import type { ParsedByType, SourceType } from "@/lib/constants";
import type {
  bankEmails,
  banks,
  categories,
  config,
  holdings,
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
export type Holding = InferSelectModel<typeof holdings>;
export type InstrumentType = NonNullable<Holding["instrument_type"]>;

export type PortfolioSummary = {
  invested: number;
};

export type TagLite = {
  id: number;
  name: string;
  color: string | null;
  emoji: string | null;
};

export type TransactionRow = Transaction & {
  category_name: string | null;
  source_name: string | null;
  destination_source_name: string | null;
  holding_name: string | null;
  source_type: SourceType;
  parsed_by: ParsedByType | null;
  reimbursement_status: "none" | "pending" | "reimbursed";
  reimbursable_amount: number | null;
  reimbursed_at: string | null;
  tags: TagLite[];
};

export type TagBreakdownRow = {
  tag_id: number;
  tag_name: string;
  total: number;
  count: number;
  percentage: number;
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

export type BiggestTransaction = {
  merchant: string | null;
  amount: number;
  date: string;
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

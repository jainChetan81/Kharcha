import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  budgets,
  categories,
  config,
  sources,
  subscriptions,
  transactions,
} from "./schema";

export type Category = InferSelectModel<typeof categories>;
export type NewCategory = InferInsertModel<typeof categories>;
export type Source = InferSelectModel<typeof sources>;
export type NewSource = InferInsertModel<typeof sources>;
export type Transaction = InferSelectModel<typeof transactions>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type Subscription = InferSelectModel<typeof subscriptions>;
export type Budget = InferSelectModel<typeof budgets>;
export type ConfigRow = InferSelectModel<typeof config>;

export type TransactionRow = Transaction & {
  category_name: string | null;
  source_name: string | null;
  source_type: "manual" | "synced" | "recurring";
};

export type MonthlySummary = {
  total_income: number;
  total_expenses: number;
};

export type CategoryBreakdownRow = {
  category_id: number;
  category_name: string;
  total: number;
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

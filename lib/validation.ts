import { z } from "zod";

// ── Reusable field schemas ──────────────────────────────────────────

export const positiveAmountSchema = z
  .number({ error: "Amount must be a number" })
  .positive("Amount must be greater than 0");

/** Accepts a string from a text input and coerces it to a positive number. */
export const amountStringSchema = z
  .string()
  .min(1, "Amount is required")
  .transform((v) => Number(v))
  .refine((n) => !Number.isNaN(n) && n > 0, "Amount must be greater than 0");

export const requiredStringSchema = (label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, `${label} is required`);

export const billingDaySchema = z
  .number({ error: "Billing day must be a number" })
  .int("Billing day must be a whole number")
  .min(1, "Billing day must be between 1 and 31")
  .max(31, "Billing day must be between 1 and 31");

/** String variant for form inputs — coerces to a validated number. */
export const billingDayStringSchema = z
  .string()
  .min(1, "Billing day is required")
  .transform((v) => Number(v))
  .refine(
    (n) => !Number.isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 31,
    "Billing day must be between 1 and 31",
  );

// ── Transaction ─────────────────────────────────────────────────────

export const transactionInputSchema = z.object({
  type: z.enum(["income", "expense", "transfer"], {
    error: "Type must be income, expense, or transfer",
  }),
  amount: positiveAmountSchema,
  merchant: z.string().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  sourceId: z.number().nullable().optional(),
  destinationSourceId: z.number().nullable().optional(),
  sourceType: z
    .enum(["manual", "synced", "recurring", "transfer"])
    .default("manual"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Date must be in YYYY-MM-DD format"),
  note: z.string().nullable().optional(),
  tagIds: z.array(z.number()).optional(),
  subscriptionId: z.number().nullable().optional(),
  gmailMessageId: z.string().nullable().optional(),
  parsedBy: z.enum(["regex", "gemini"]).nullable().optional(),
  reimbursementStatus: z
    .enum(["none", "pending", "reimbursed"])
    .default("none"),
});

// ── Subscription ────────────────────────────────────────────────────

export const subscriptionInputSchema = z.object({
  name: requiredStringSchema("Name"),
  amount: positiveAmountSchema,
  billingDay: billingDaySchema,
  categoryId: z.number().nullable(),
  sourceId: z.number().nullable(),
});

// ── Budget ──────────────────────────────────────────────────────────

export const budgetAmountSchema = amountStringSchema;

// ── Config ──────────────────────────────────────────────────────────

export const configSchema = z.object({
  key: z.string().min(1, "Config key is required"),
  value: z.string(),
});

// ── Inferred types (single source of truth) ─────────────────────────

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
export type ConfigInput = z.infer<typeof configSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the first human-readable error from a ZodError. */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation failed";
}

/**
 * Validate a single field value against a Zod schema.
 * Returns the error message string or undefined if valid.
 * Use in TanStack Form `validators.onSubmit`.
 */
export function validateField<T>(
  schema: z.ZodType<T>,
  value: unknown,
): string | undefined {
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  return firstZodError(result.error);
}

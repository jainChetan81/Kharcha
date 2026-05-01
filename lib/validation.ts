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

export const billingDaysSchema = z
  .array(billingDaySchema)
  .min(1, "Pick at least one billing day")
  .refine((arr) => new Set(arr).size === arr.length, "Days must be unique");

// ── Transaction ─────────────────────────────────────────────────────

export const transactionInputSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer", "investment"], {
      error: "Type must be income, expense, transfer, or investment",
    }),
    amount: positiveAmountSchema,
    merchant: z.string().nullable().optional(),
    categoryId: z.number().nullable().optional(),
    sourceId: z.number().nullable().optional(),
    destinationSourceId: z.number().nullable().optional(),
    holdingId: z.number().nullable().optional(),
    investmentKind: z
      .enum(["buy", "sell", "dividend", "interest"])
      .nullable()
      .optional(),
    units: z.number().nullable().optional(),
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
    reimbursableAmount: z.number().positive().nullable().optional(),
  })
  // Guard the DB boundary against orphaned investment rows: any path that
  // bypasses the UI (Gmail parse, bulk import) still has to carry a holding
  // link and kind, otherwise the row is invisible to portfolio aggregations.
  .refine((v) => v.type !== "investment" || v.holdingId != null, {
    message: "holdingId is required when type is investment",
    path: ["holdingId"],
  })
  .refine((v) => v.type !== "investment" || v.investmentKind != null, {
    message: "investmentKind is required when type is investment",
    path: ["investmentKind"],
  })
  .refine(
    (v) => v.reimbursableAmount == null || v.reimbursableAmount <= v.amount,
    {
      message: "Reimbursable amount can't exceed the transaction amount",
      path: ["reimbursableAmount"],
    },
  );

// ── Subscription ────────────────────────────────────────────────────

export const subscriptionInputSchema = z
  .object({
    name: requiredStringSchema("Name"),
    amount: positiveAmountSchema,
    billingDays: billingDaysSchema,
    categoryId: z.number().nullable(),
    sourceId: z.number().nullable(),
    type: z.enum(["expense", "investment"]).default("expense"),
    holdingId: z.number().nullable().optional(),
    investmentKind: z
      .enum(["buy", "sell", "dividend", "interest"])
      .nullable()
      .optional(),
    defaultUnits: z.number().nullable().optional(),
  })
  // Prevent orphan SIPs: a subscription flagged as investment but missing the
  // holding link would silently skip every auto-post (processSubscriptions
  // guards on sub.holding_id != null), leaving the user wondering why their
  // recurring investment never shows up.
  .refine((v) => v.type !== "investment" || v.holdingId != null, {
    message: "holdingId is required for investment subscriptions",
    path: ["holdingId"],
  });

// ── Tag schedule ────────────────────────────────────────────────────

const datetimeStringSchema = z
  .string()
  .min(1, "Pick date & time")
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Date must be YYYY-MM-DD HH:mm");

export const tagScheduleSchema = z
  .object({
    name: requiredStringSchema("Name"),
    startAt: datetimeStringSchema,
    endAt: datetimeStringSchema,
  })
  .refine((v) => v.endAt >= v.startAt, {
    message: "End must be on or after start",
    path: ["endAt"],
  });

// ── Config ──────────────────────────────────────────────────────────

export const configSchema = z.object({
  key: z.string().min(1, "Config key is required"),
  value: z.string(),
});

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

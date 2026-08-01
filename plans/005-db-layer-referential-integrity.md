# Plan 005: Database layer referential integrity and correctness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- lib/db/index.ts lib/db/sources.ts lib/db/categories.ts lib/db/subscriptions.ts lib/db/holdings.ts lib/db/banks.ts lib/db/schema.ts lib/db/connection.ts lib/db/tags.ts drizzle/`
> If any cited file changed, re-read it and reconcile the excerpts below
> against the current content before editing. If `deleteTransaction`,
> `clearAllTransactions`, `deleteHoldingCascade`, `deleteSubscription`,
> `deleteSource`, `deleteCategory`, `updateTransaction`, or
> `findDuplicateTransaction` have been restructured (not just moved), STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`, 2026-08-01)

## Why this matters

Seven findings, all independently re-verified against the current tree (see
"Findings reconsidered" at the bottom of this section — none were stale).
They share a root cause: several db-layer functions don't clean up or
serialize around related rows the way their nearest sibling function does.

1. **Every path that bulk-deletes `transactions` leaves orphaned
   `transaction_tags` rows.** `schema.ts` declares
   `onDelete: "cascade"` on `transaction_tags.transaction_id` and
   `.tag_id`, but SQLite never enforces `ON DELETE CASCADE` unless
   `PRAGMA foreign_keys = ON` has been run on that connection — and
   `connection.ts` never runs it. The team clearly knows the join table
   needs manual cleanup: `deleteTag()` already does it correctly. But
   **five** call sites that delete from `transactions` don't:
   `deleteTransaction`, `clearAllTransactions` (both `lib/db/index.ts`),
   `deleteHoldingCascade` (`lib/db/holdings.ts`, two separate `delete`
   calls), and `deleteSubscription` (`lib/db/subscriptions.ts` — this fifth
   site was not named in the original audit finding but has the identical
   bug; see "Findings reconsidered").
2. **`deleteSource()` doesn't clear the source references it leaves
   behind.** `deleteCategory()` nulls out every FK that points at the row
   before deleting it; `deleteSource()` just deletes, silently orphaning
   `transactions.source_id`, `transactions.destination_source_id`, and
   `subscriptions.source_id`.
3. **The generated migration and its own snapshot disagree.** The 0000
   migration never creates `mini_transaction_id_idx`, but
   `meta/0000_snapshot.json` claims it already exists — so a future
   `pnpm drizzle:generate` won't notice it's missing. The app only works
   today because `initDB()`'s manual safety net creates the index anyway.
4. **`findDuplicateTransaction()` mixes UTC and local dates.** Its ±1-day
   window is computed via `new Date(...).toISOString()` (UTC) and compared
   against transaction dates that are stored and elsewhere always handled
   as local strings — a real bug for IST users (this app's stated default
   currency locale) near local midnight.
5. **`updateTransaction()` reads a pre-edit snapshot outside the
   transaction that acts on it.** `deleteTransaction()` does the equivalent
   read *inside* its `withTransactionAsync` callback; `updateTransaction()`
   reads `existingRow` before ever opening the transaction.
6. **`addCategory`/`addSource`/`addHolding`/`addBank` can double-insert on
   a fast double-tap.** Each does a case-insensitive check-then-insert with
   no DB-level unique constraint backing it up (unlike `tags.name`, which
   has `.unique()`).
7. **`getUnusedSubscriptions()` lies about its own row shape.** It casts
   its result to `SubscriptionAuditRow` (which requires every
   `Subscription` field) but the underlying `.select()` never fetches
   `type`, `holding_id`, `investment_kind`, or `default_units` — any future
   caller reading those fields gets `undefined` at runtime despite
   TypeScript claiming otherwise.

**Findings reconsidered**: none were stale, already-fixed, or wrong. One
finding turned out narrower than reality: audit finding #48 named
`deleteTransaction`/`clearAllTransactions`/`deleteHoldingCascade` as the
gap sites for `transaction_tags` cleanup; re-verification found a fifth
site with the identical bug (`deleteSubscription`, which also bulk-deletes
`transactions`) that the audit missed. It's folded into Step 2 below since
it's the same bug class in the same file family.

## Decision point: enable `PRAGMA foreign_keys = ON`, or fix each gap by hand?

This plan has to choose between two ways to close finding 1
(`transaction_tags` orphans):

- **Option A — flip the global switch.** Add
  `handle.execSync("PRAGMA foreign_keys = ON;")` to `openConnection()` in
  `lib/db/connection.ts`. SQLite would then actually enforce every declared
  `onDelete: "cascade"` (today, only `transaction_tags`'s two FKs declare
  one), fixing all five orphan sites in a single line, plus any future
  cascade gap for free.
- **Option B — hand-write the missing cleanup**, matching `deleteTag()`'s
  existing pattern, at each of the five gap sites.

**Recommendation: Option B for this plan.** Option A is the architecturally
cleaner fix, but it's not free, and this repo has no automated test suite
to catch what it might break:

- Only `transaction_tags`'s FKs declare `onDelete: "cascade"`. Every other
  FK in `schema.ts` (`transactions.category_id`, `.source_id`,
  `.destination_source_id`, `.holding_id`; `subscriptions.category_id`,
  `.source_id`, `.holding_id`; `bank_emails.bank_id`; `budgets.category_id`)
  has **no** `onDelete` clause, which SQLite defaults to `NO ACTION` —
  meaning under `PRAGMA foreign_keys = ON` these become enforced,
  non-deferred constraints. Any statement that deletes a parent row while a
  child still references it would now throw `FOREIGN KEY constraint
  failed` instead of silently leaving a dangling value.
- That's a real, immediate problem for `deleteSource()` specifically — the
  very function this plan fixes in Step 3. Its current body deletes the
  source row with no cleanup first; under FK enforcement it would start
  hard-failing (not silently orphaning) the moment a referenced source is
  deleted, until Step 3's fix ships in the same change. Ordering aside,
  it's evidence the two problems (missing cascade enforcement, missing
  manual cleanup) are entangled in ways that need a dedicated audit of
  *every* delete/insert path, not just the ones this bucket's findings
  happened to name.
- `expo-sqlite`'s own `withTransactionAsync` doc comment (confirmed by
  reading `node_modules/expo-sqlite/build/SQLiteDatabase.js:98-99`) states:
  *"this transaction is not exclusive and can be interrupted by other async
  queries"*. FK enforcement is checked by SQLite itself per-statement, so
  it doesn't depend on that caveat — but it does mean a repo-wide
  enforcement flip is exactly the kind of cross-cutting behavior change
  that needs real regression coverage, and this app has none (`pnpm test`
  does not exist; see "Commands you will need" below).
- The Status block for this plan is Risk: MED. A global enforcement flip
  with an unaudited blast radius across every delete/insert path in the app
  is a HIGH-risk change; it doesn't fit this plan's budget.

Option B is bounded, mechanical, and independently verifiable per call
site — exactly the five (now known) sites get the same treatment
`deleteTag()` already uses. Option A remains the correct end state and is
recorded in "Maintenance notes" as explicit future work: a dedicated plan
that (a) audits every `db.delete(...)`/`db.insert(...)` call site in
`lib/db/` for FK-ordering hazards, (b) flips the pragma, and (c) is
verified with real manual regression passes over add/edit/delete for every
entity type, since there's no test suite to lean on.

## Current state

**The declared-but-unenforced cascade** — `lib/db/schema.ts:170-183`:
```ts
export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transaction_id: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.transaction_id, table.tag_id] }),
  }),
);
```
`lib/db/connection.ts:18-25` — `openConnection()` never runs
`PRAGMA foreign_keys`:
```ts
function openConnection(): SQLite.SQLiteDatabase {
  const handle = SQLite.openDatabaseSync(DB_NAME);
  handle.execSync("PRAGMA cache_size = -4000;");
  handle.execSync("PRAGMA journal_mode = WAL;");
  handle.execSync("PRAGMA synchronous = NORMAL;");
  handle.execSync("PRAGMA temp_store = MEMORY;");
  return handle;
}
```

**The reference pattern** — `lib/db/tags.ts:187-192`, `deleteTag()`:
```ts
export async function deleteTag(id: number) {
  await expo.withTransactionAsync(async () => {
    await db.delete(transactionTags).where(eq(transactionTags.tag_id, id));
    await db.delete(tags).where(eq(tags.id, id));
  });
}
```

**The five gap sites** (all confirmed via `grep -rn "db.delete(transactions)" lib/db/*.ts`):

- `lib/db/index.ts:1611-1637` — `deleteTransaction`:
  ```ts
  export async function deleteTransaction(id: number) {
    try {
      await expo.withTransactionAsync(async () => {
        const [existing] = await db
          .select({ holding_id: transactions.holding_id })
          .from(transactions)
          .where(eq(transactions.id, id))
          .limit(1);
        await db.delete(transactions).where(eq(transactions.id, id));
        if (existing?.holding_id) {
          await safeRecomputeHolding(existing.holding_id, {
            operation: "deleteTransaction",
          });
        }
      });
    } catch (error) { /* logFirebaseError + rethrow */ }
  }
  ```
- `lib/db/index.ts:1639-1649` — `clearAllTransactions`:
  ```ts
  export async function clearAllTransactions() {
    try {
      return await db.delete(transactions);
    } catch (error) { /* logFirebaseError + rethrow */ }
  }
  ```
- `lib/db/holdings.ts:64-79` — `deleteHoldingCascade` (two `delete(transactions)` calls):
  ```ts
  export async function deleteHoldingCascade(id: number): Promise<void> {
    await expo.withTransactionAsync(async () => {
      const linkedSubs = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.holding_id, id));
      for (const sub of linkedSubs) {
        await db
          .delete(transactions)
          .where(eq(transactions.subscription_id, sub.id));
        await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
      }
      await db.delete(transactions).where(eq(transactions.holding_id, id));
      await db.delete(holdings).where(eq(holdings.id, id));
    });
  }
  ```
- `lib/db/subscriptions.ts:184-189` — `deleteSubscription` (the site the
  audit missed):
  ```ts
  export async function deleteSubscription(id: number) {
    await expo.withTransactionAsync(async () => {
      await db.delete(transactions).where(eq(transactions.subscription_id, id));
      await db.delete(subscriptions).where(eq(subscriptions.id, id));
    });
  }
  ```

**The reference pattern for reference-clearing** —
`lib/db/categories.ts:56-77`, `deleteCategory()`:
```ts
export async function deleteCategory(id: number) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id));
  if (!existing || existing.is_default === 1) return;

  await expo.withTransactionAsync(async () => {
    await db
      .update(transactions)
      .set({ category_id: null })
      .where(eq(transactions.category_id, id));
    await db
      .update(subscriptions)
      .set({ category_id: null })
      .where(eq(subscriptions.category_id, id));
    await db.delete(budgets).where(eq(budgets.category_id, id));
    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.is_default, 0)));
  });
}
```

**The gap** — `lib/db/sources.ts` (44 lines total), `deleteSource()` at
lines 40-44 — no reference clearing at all:
```ts
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./connection";
import { sources } from "./schema";
import type { Source } from "./types";
...
export async function deleteSource(id: number) {
  return db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
}
```
Note `sources.ts` doesn't import `expo` (needed for
`withTransactionAsync`) or `subscriptions`/`transactions` from `./schema` —
both need adding. `hooks/use-sources.ts:35-42`'s `useDeleteSource` mutation
only invalidates the sources query cache — it doesn't invalidate
transactions, so a stale `source_id` also wouldn't get refetched/re-checked
client-side either, purely a server-side (db) fix here.

**The migration/snapshot drift** — `drizzle/0000_blushing_cobalt_man.sql`
defines the `transactions` table (lines 97-125) with
`` `mini_transaction_id` integer `` (line 111) and **no**
`CREATE UNIQUE INDEX` for it anywhere in the file (confirmed:
`grep -n "mini_transaction_id\|CREATE UNIQUE INDEX" drizzle/0000_blushing_cobalt_man.sql`
only matches the column declaration and two unrelated unique indexes for
`budgets` and `tags`). Meanwhile `drizzle/meta/0000_snapshot.json:800-809`
claims the index already exists as part of the post-migration state:
```json
"indexes": {
  "mini_transaction_id_idx": {
    "name": "mini_transaction_id_idx",
    "columns": ["mini_transaction_id"],
    "isUnique": true
  }
},
```
This is the only migration this repo has ever generated
(`drizzle/meta/_journal.json` has exactly one entry, `idx: 0`,
`tag: "0000_blushing_cobalt_man"`) — `drizzle/migrations.js` is
hand-maintained per `docs/DRIZZLE.md` and currently imports only `m0000`.
The app boots fine today only because `lib/db/index.ts:357-359` creates the
index unconditionally on every launch as part of the safety net:
```ts
await db.run(
  sql`CREATE UNIQUE INDEX IF NOT EXISTS mini_transaction_id_idx ON transactions(mini_transaction_id)`,
);
```
`docs/DRIZZLE.md` is explicit that `drizzle/meta/` should never be
hand-edited ("Never edit this manually — `pnpm drizzle:generate` handles
it") — Step 4 below is a deliberate, narrow exception to that rule, because
the metadata is already wrong, not because this plan wants to bypass the
generator. The correction makes the generator's own diff honest again; the
generator (not this plan) then produces the actual new migration file.

**The timezone bug** — `lib/db/index.ts:1954-1984`, `findDuplicateTransaction()`:
```ts
export async function findDuplicateTransaction(
  date: string,
  amount: number,
  merchant: string,
): Promise<boolean> {
  try {
    const target = new Date(date);
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(target.getTime() - day).toISOString().slice(0, 10);
    const to = new Date(target.getTime() + day).toISOString().slice(0, 10);
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          sql`substr(${transactions.date}, 1, 10) >= ${from}`,
          sql`substr(${transactions.date}, 1, 10) <= ${to}`,
          eq(transactions.amount, amount),
          sql`LOWER(${transactions.merchant}) = ${merchant.toLowerCase()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (error) { /* logFirebaseError + rethrow */ }
}
```
Both call sites (`hooks/use-add-transaction.ts:363-367` and
`lib/mini-sync.ts:200-204`) pass local date-ish strings — mini-sync's
comment even says so explicitly: *"Mini dates are YYYY-MM-DD or
YYYY-MM-DD HH:mm — keep the time component"*. `new Date(...).toISOString()`
converts through UTC, shifting the calendar day backward for any IST
(UTC+5:30) time before 05:30 local. The fix is a one-line swap to the
date-fns helpers this same file already imports at the top
(`lib/db/index.ts:1-9`: `addDays, format, ... subDays, ...`) and already
uses the same way in `getUnusedSubscriptions`'s cutoff calculation
(`lib/db/subscriptions.ts:541`:
`format(subDays(new Date(), 60), DATE_ISO_FORMAT)`) — no UTC conversion,
matches storage format exactly.

**The race** — `lib/db/index.ts:1483-1609`, `updateTransaction()` (relevant
slice):
```ts
const [existingRow] = await db
  .select({
    source_type: transactions.source_type,
    holding_id: transactions.holding_id,
  })
  .from(transactions)
  .where(eq(transactions.id, id))
  .limit(1);
if (params.sourceType !== undefined) {
  const current = existingRow?.source_type ?? "manual";
  const next = params.sourceType;
  const editable = (v: SourceType) => v === "manual" || v === "transfer";
  if (editable(current) && editable(next)) {
    updates.source_type = next;
  }
}
await expo.withTransactionAsync(async () => {
  await db.update(transactions).set(updates).where(eq(transactions.id, id));
  // ...tagIds handling, safeRecomputeHolding for old/new holding_id...
});
```
Compare `deleteTransaction()` above, which reads its equivalent snapshot
*inside* the `withTransactionAsync` callback. Note (surfaced during
re-verification, not in the original finding): per `expo-sqlite`'s own doc
comment, `withTransactionAsync` "is not exclusive and can be interrupted by
other async queries" — moving the read inside the callback tightens the
race window to match `deleteTransaction()`'s existing (imperfect but
established) pattern; it does not make the read-then-write fully atomic.
True exclusivity would require `withExclusiveTransactionAsync`, which nothing
in this codebase uses today, isn't available on web (this repo does ship a
`pnpm web` target), and — per the same doc comment — makes *other*
concurrent writes fail with "database is locked" rather than queue. That
tradeoff is out of scope for this plan; noted in "Maintenance notes."

**The uniqueness race** — the four `add*` functions, all the same shape.
`lib/db/categories.ts:36-54` (`addCategory`):
```ts
export async function addCategory(name: string, type: "income" | "expense") {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.type, type),
        sql`LOWER(${categories.name}) = ${trimmed.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };
  const result = await db
    .insert(categories)
    .values({ name: trimmed, type, is_default: 0 });
  return { id: Number(result.lastInsertRowId), isNew: true };
}
```
`lib/db/sources.ts:25-38` (`addSource`) and `lib/db/holdings.ts:35-54`
(`addHolding`) follow the identical check-then-insert shape, returning
`{ id, isNew }`. `lib/db/banks.ts:57-70` (`addBank`) follows the same
check-then-insert but **throws** on a match instead of returning
`isNew: false`:
```ts
export async function addBank(name: string, parserKey: string | null = null) {
  const existing = (await db
    .select()
    .from(banks)
    .where(sql`lower(${banks.name}) = lower(${name})`)
    .limit(1)) as Bank[];
  if (existing.length > 0) {
    throw new Error(`Bank "${name}" already exists`);
  }
  const result = await db
    .insert(banks)
    .values({ name, parser_key: parserKey, is_default: 0, is_active: 1 });
  return Number(result.lastInsertRowId);
}
```
None of `categories`, `sources`, `holdings`, `banks` has a unique index on
`name` in `schema.ts` — only `tags.name` does
(`text("name").notNull().unique()`, `lib/db/schema.ts:159`). Drizzle's
sqlite-core `uniqueIndex(...).on(...)` accepts a raw `SQL` expression as a
column (confirmed: `IndexColumn = SQLiteColumn | SQL` in
`node_modules/drizzle-orm/sqlite-core/indexes.d.ts`), so a case-insensitive
functional index (`on(sql\`lower(${table.name})\`)`) is achievable without
adding a generated column.

**The dishonest cast** — `lib/db/subscriptions.ts:534-568`:
```ts
export type SubscriptionAuditRow = SubscriptionRow & {
  last_charged: string | null;
};

export async function getUnusedSubscriptions(): Promise<
  SubscriptionAuditRow[]
> {
  const cutoff = format(subDays(new Date(), 60), DATE_ISO_FORMAT);
  const rows = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amount: subscriptions.amount,
      billing_day: subscriptions.billing_day,
      billing_days: subscriptions.billing_days,
      category_id: subscriptions.category_id,
      source_id: subscriptions.source_id,
      is_active: subscriptions.is_active,
      created_at: subscriptions.created_at,
      category_name: categories.name,
      source_name: sources.name,
      last_charged: sql<string | null>`MAX(${transactions.date})`,
    })
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.category_id, categories.id))
    .leftJoin(sources, eq(subscriptions.source_id, sources.id))
    .leftJoin(transactions, eq(transactions.subscription_id, subscriptions.id))
    .where(eq(subscriptions.is_active, 1))
    .groupBy(subscriptions.id)
    .having(
      sql`MAX(${transactions.date}) IS NULL OR MAX(${transactions.date}) < ${cutoff}`,
    );
  return rows as SubscriptionAuditRow[];
}
```
`SubscriptionRow = Subscription & { category_name, source_name }` and
`Subscription = InferSelectModel<typeof subscriptions>` (`lib/db/types.ts`)
— which includes `type`, `holding_id`, `investment_kind`, `default_units`,
none of which the `.select()` above fetches. The only current consumer
(`app/subscriptions/index.tsx:237-274`, `UnusedSubCard`) only reads `.name`,
`.amount`, `.last_charged`, `.id` — so this is a real but currently latent
type lie, not an active runtime bug.

**Repo conventions relevant to every step below**: no `any` types;
functional components only (not applicable here — this plan is db-layer
only); TanStack Query for data fetching (unaffected — hooks are out of
scope); **never run pnpm commands yourself — tell the operator which
command to run and wait for the result.** Steps 4-5 touch the schema —
per project convention, any schema change requires editing
`lib/db/schema.ts`, running `pnpm drizzle:generate`, **and** keeping the
inline `CREATE TABLE IF NOT EXISTS` / index-creation block in `initDB()`
(`lib/db/index.ts`) in sync, since both run on every app launch.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Full gate | `pnpm quality` | exit 0 |
| Dead code | `pnpm dead-code` | no new findings |
| Generate migration | `pnpm drizzle:generate` | new `drizzle/0001_*.sql`; `meta/_journal.json` and `migrations.js` auto-updated |
| Inspect DB | `pnpm drizzle:studio` | browse tables to confirm cleanup/index behavior |
| Run iOS | `pnpm ios` | app launches for manual smoke test |
| Run Android | `pnpm android` | app launches for manual smoke test |

There is no automated test runner configured in this repo (no `test` script
in `package.json`, no vitest/jest dependency) — verification for this plan
is typecheck/lint/quality plus the manual smoke tests called out per step.

## Scope

**In scope**:
- `lib/db/index.ts` — `deleteTransaction`, `clearAllTransactions`,
  `updateTransaction`, `findDuplicateTransaction`, `initDB()`'s inline DDL
  block
- `lib/db/holdings.ts` — `deleteHoldingCascade`, `addHolding`
- `lib/db/subscriptions.ts` — `deleteSubscription`, `getUnusedSubscriptions`
- `lib/db/sources.ts` — `deleteSource`, `addSource`
- `lib/db/categories.ts` — `addCategory` only (`deleteCategory` is the
  reference pattern; read-only)
- `lib/db/banks.ts` — `addBank`
- `lib/db/schema.ts` — new case-insensitive unique indexes on
  `categories`, `sources`, `holdings`, `banks`
- `drizzle/meta/0000_snapshot.json` — one narrow correction (the false
  `mini_transaction_id_idx` claim), per the exception explained in "Current
  state"
- `drizzle/` — the new migration file, updated `migrations.js` and
  `meta/_journal.json`, all produced by `pnpm drizzle:generate` (not
  hand-authored)

**Out of scope** (do NOT touch):
- `lib/db/connection.ts` — `PRAGMA foreign_keys = ON` is explicitly
  deferred; see "Decision point" above and "Maintenance notes" below.
- `lib/db/tags.ts` (`deleteTag`) and `lib/db/categories.ts`
  (`deleteCategory`) — already correct; they are the patterns to copy, not
  edit.
- `lib/db/holdings.ts`'s buy/sell/dividend math (`recomputeHoldingFromTransactions`,
  `safeRecomputeHolding`) — a different finding bucket.
- De-duplicating any pre-existing case-insensitive duplicate names
  discovered by Step 4's pre-flight check — that's a data decision for the
  operator, not something this plan auto-resolves.
- Adopting `withExclusiveTransactionAsync` anywhere — noted as a caveat in
  Step 8, not adopted.
- Any hooks/UI changes beyond what's required for the touched files to
  typecheck (no new UI surfaces; `getUnusedSubscriptions`'s consumer needs
  no changes since it doesn't read the newly-added fields).

## Git workflow

- Branch: `fix/005-db-layer-referential-integrity`
- Commit per step; style: `fix(db): clear transaction_tags on every transaction-deleting path`, `fix(db): null out source references in deleteSource`, `fix(db): correct mini_transaction_id_idx migration/snapshot drift`, `fix(db): case-insensitive unique constraint on name-uniqueness tables`, `fix(db): use local dates in findDuplicateTransaction`, `fix(db): read updateTransaction snapshot inside its own transaction`, `fix(db): getUnusedSubscriptions select matches its declared type`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `transaction_tags` cleanup to every transaction-deleting path

Apply `deleteTag()`'s pattern (delete children, then delete/update the
parent, both inside the same `withTransactionAsync`) at all five sites.

In `lib/db/index.ts`, add `transactionTags` to the existing import from
`./schema` if not already present (it is — confirm at the top of the file),
then:

```ts
export async function deleteTransaction(id: number) {
  try {
    await expo.withTransactionAsync(async () => {
      const [existing] = await db
        .select({ holding_id: transactions.holding_id })
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);
      await db.delete(transactionTags).where(eq(transactionTags.transaction_id, id));
      await db.delete(transactions).where(eq(transactions.id, id));
      if (existing?.holding_id) {
        await safeRecomputeHolding(existing.holding_id, {
          operation: "deleteTransaction",
        });
      }
    });
  } catch (error) { /* unchanged */ }
}

export async function clearAllTransactions() {
  try {
    return await expo.withTransactionAsync(async () => {
      await db.delete(transactionTags);
      await db.delete(transactions);
    });
  } catch (error) { /* unchanged */ }
}
```

In `lib/db/holdings.ts`, add `transactionTags` to the `from "./schema"`
import, then delete the join rows via a subquery *before* deleting the
transactions they reference (the subquery target has to still exist):

```ts
export async function deleteHoldingCascade(id: number): Promise<void> {
  await expo.withTransactionAsync(async () => {
    const linkedSubs = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.holding_id, id));
    for (const sub of linkedSubs) {
      await db
        .delete(transactionTags)
        .where(
          sql`${transactionTags.transaction_id} IN (SELECT id FROM transactions WHERE subscription_id = ${sub.id})`,
        );
      await db
        .delete(transactions)
        .where(eq(transactions.subscription_id, sub.id));
      await db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
    }
    await db
      .delete(transactionTags)
      .where(
        sql`${transactionTags.transaction_id} IN (SELECT id FROM transactions WHERE holding_id = ${id})`,
      );
    await db.delete(transactions).where(eq(transactions.holding_id, id));
    await db.delete(holdings).where(eq(holdings.id, id));
  });
}
```

In `lib/db/subscriptions.ts`, add `transactionTags` to the `from "./schema"`
import, then the same subquery pattern:

```ts
export async function deleteSubscription(id: number) {
  await expo.withTransactionAsync(async () => {
    await db
      .delete(transactionTags)
      .where(
        sql`${transactionTags.transaction_id} IN (SELECT id FROM transactions WHERE subscription_id = ${id})`,
      );
    await db.delete(transactions).where(eq(transactions.subscription_id, id));
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
  });
}
```

**Verify**: `pnpm typecheck` → exit 0. Manual check via `pnpm drizzle:studio`:
create a transaction, tag it, delete the transaction, confirm the
`transaction_tags` table has no row for that transaction id. Repeat for a
holding with a linked buy transaction (delete the holding) and a
subscription with a generated transaction (delete the subscription).

### Step 2: Fix `deleteSource()` to clear its references, matching `deleteCategory()`

In `lib/db/sources.ts`, add `expo` to the `./connection` import and
`subscriptions`, `transactions` to the `./schema` import:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import expo, { db } from "./connection";
import { sources, subscriptions, transactions } from "./schema";
import type { Source } from "./types";
```

Replace `deleteSource`:

```ts
export async function deleteSource(id: number) {
  await expo.withTransactionAsync(async () => {
    await db
      .update(transactions)
      .set({ source_id: null })
      .where(eq(transactions.source_id, id));
    await db
      .update(transactions)
      .set({ destination_source_id: null })
      .where(eq(transactions.destination_source_id, id));
    await db
      .update(subscriptions)
      .set({ source_id: null })
      .where(eq(subscriptions.source_id, id));
    await db
      .delete(sources)
      .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
  });
}
```

**Verify**: `pnpm typecheck` → exit 0. Manual check: create a custom
source, use it on a transaction and a subscription, delete the source, and
confirm via `pnpm drizzle:studio` that both rows now have `source_id`
(and `destination_source_id` where applicable) set to `NULL` rather than a
dangling id.

### Step 3: Correct the `mini_transaction_id_idx` migration/snapshot drift

In `drizzle/meta/0000_snapshot.json`, remove the false claim so the
generator's diff is honest again — delete the `mini_transaction_id_idx`
entry from the `transactions` table's `"indexes"` object (currently lines
800-809; leave the object as `"indexes": {}` if it's the only entry, or
just the one key if siblings exist — re-check before editing since Step 4
below adds new indexes to *other* tables in the same snapshot, not this
one). Do not touch `0000_blushing_cobalt_man.sql` itself — it already
shipped and must not be edited.

**Verify**: `grep -n "mini_transaction_id_idx" drizzle/meta/0000_snapshot.json`
→ no matches.

### Step 4: Add case-insensitive unique indexes for name-uniqueness tables

This is the DB-level backstop for finding 6 (double-insert race on
`addCategory`/`addSource`/`addHolding`/`addBank`). **Before writing the
schema change**, check whether any existing data would violate the new
constraint — a `CREATE UNIQUE INDEX` that fails would break `initDB()` (and
therefore the app) on every subsequent launch for anyone who already has
case-insensitive duplicates. Run via `pnpm drizzle:studio`'s SQL query tab
(or ask the operator to run and report back):

```sql
SELECT type, lower(name), COUNT(*) FROM categories GROUP BY type, lower(name) HAVING COUNT(*) > 1;
SELECT lower(name), COUNT(*) FROM sources GROUP BY lower(name) HAVING COUNT(*) > 1;
SELECT lower(name), COUNT(*) FROM holdings GROUP BY lower(name) HAVING COUNT(*) > 1;
SELECT lower(name), COUNT(*) FROM banks GROUP BY lower(name) HAVING COUNT(*) > 1;
```

If any of these return rows, **STOP** — do not add the unique index for
that table. Report the duplicates to the operator; merging/renaming
existing rows is a data decision outside this plan's scope. Proceed only
with the tables that come back empty.

For each table that's clear, add a `sql` import to `lib/db/schema.ts`
(`import { sql } from "drizzle-orm";`) and a functional unique index:

```ts
export const categories = sqliteTable(
  "categories",
  { /* unchanged columns */ },
  (table) => ({
    nameTypeUniqueIdx: uniqueIndex("categories_type_name_unique").on(
      table.type,
      sql`lower(${table.name})`,
    ),
  }),
);

export const sources = sqliteTable(
  "sources",
  { /* unchanged columns */ },
  (table) => ({
    nameUniqueIdx: uniqueIndex("sources_name_unique").on(sql`lower(${table.name})`),
  }),
);

export const holdings = sqliteTable(
  "holdings",
  { /* unchanged columns */ },
  (table) => ({
    nameUniqueIdx: uniqueIndex("holdings_name_unique").on(sql`lower(${table.name})`),
  }),
);

export const banks = sqliteTable(
  "banks",
  { /* unchanged columns */ },
  (table) => ({
    nameUniqueIdx: uniqueIndex("banks_name_unique").on(sql`lower(${table.name})`),
  }),
);
```

Tell the operator to run `pnpm drizzle:generate`. Review the resulting
`drizzle/0001_*.sql` before continuing: it should contain exactly one
`CREATE UNIQUE INDEX` per table changed in Steps 3-4 (up to five: the
corrected `mini_transaction_id_idx` plus whichever of
categories/sources/holdings/banks passed the duplicate check) and nothing
else — no unrelated `ALTER`/`DROP`. If it contains anything unexpected,
STOP and report rather than accepting it.

Update `lib/db/index.ts`'s `initDB()` inline safety net to match — add
`IF NOT EXISTS` guarded `CREATE UNIQUE INDEX` statements next to the
existing `mini_transaction_id_idx` line (357-359) for each table that
passed its duplicate check, e.g.:

```ts
await db.run(
  sql`CREATE UNIQUE INDEX IF NOT EXISTS categories_type_name_unique ON categories(type, lower(name))`,
);
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm drizzle:generate` produces the
expected minimal migration (manual review); `grep -n "CREATE UNIQUE INDEX"
lib/db/index.ts` shows the new lines alongside the existing
`mini_transaction_id_idx` one.

### Step 5: Make `addCategory`/`addSource`/`addHolding`/`addBank` degrade gracefully under the new constraint

The existing check-then-insert stays (it's still the common-case fast
path and gives a clean `{ id, isNew: false }` / friendly-throw result
without a round trip through a raw SQLite error). Wrap the `insert` in a
`try/catch` so the rare race — both the check *and* the insert happen to
interleave with a concurrent identical insert — resolves the same way a
non-racing duplicate does, instead of surfacing a raw `UNIQUE constraint
failed` message. Example for `addCategory` (apply the equivalent shape to
`addSource`/`addHolding`; `addBank` re-throws its existing friendly
`Bank "${name}" already exists` message instead of returning `isNew`):

```ts
export async function addCategory(name: string, type: "income" | "expense") {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.type, type),
        sql`LOWER(${categories.name}) = ${trimmed.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };
  try {
    const result = await db
      .insert(categories)
      .values({ name: trimmed, type, is_default: 0 });
    return { id: Number(result.lastInsertRowId), isNew: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      const [raced] = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.type, type),
            sql`LOWER(${categories.name}) = ${trimmed.toLowerCase()}`,
          ),
        )
        .limit(1);
      if (raced) return { id: raced.id, isNew: false };
    }
    throw error;
  }
}
```

Only apply this to tables where Step 4 actually created the unique index —
skip the ones that had to be excluded for a table with pre-existing
duplicates (the check-then-insert race remains a known, documented gap for
that table until the operator resolves the duplicate data separately).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 6: Fix `findDuplicateTransaction()`'s timezone bug

`date-fns`'s `addDays`, `format`, `subDays`, and `DATE_ISO_FORMAT` are
already imported at the top of `lib/db/index.ts` — no new imports needed.

```ts
export async function findDuplicateTransaction(
  date: string,
  amount: number,
  merchant: string,
): Promise<boolean> {
  try {
    const target = new Date(date);
    const from = format(subDays(target, 1), DATE_ISO_FORMAT);
    const to = format(addDays(target, 1), DATE_ISO_FORMAT);
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          sql`substr(${transactions.date}, 1, 10) >= ${from}`,
          sql`substr(${transactions.date}, 1, 10) <= ${to}`,
          eq(transactions.amount, amount),
          sql`LOWER(${transactions.merchant}) = ${merchant.toLowerCase()}`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (error) { /* unchanged */ }
}
```

`format()` renders in the device's local timezone (no UTC conversion),
matching how `transactions.date` strings are stored and compared
everywhere else in this window.

**Verify**: `pnpm typecheck` → exit 0. Manual check: on a device/simulator
set to IST, add a transaction dated e.g. `2024-01-15 02:00` with a
merchant, then attempt to add another with the same merchant/amount dated
`2024-01-15 23:00` — confirm the duplicate sheet appears (before the fix,
the UTC shift could push `from`/`to` a day off and miss this pair
depending on exact times).

### Step 7: Move `updateTransaction()`'s snapshot read inside its transaction

```ts
await expo.withTransactionAsync(async () => {
  const [existingRow] = await db
    .select({
      source_type: transactions.source_type,
      holding_id: transactions.holding_id,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  if (params.sourceType !== undefined) {
    const current = existingRow?.source_type ?? "manual";
    const next = params.sourceType;
    const editable = (v: SourceType) => v === "manual" || v === "transfer";
    if (editable(current) && editable(next)) {
      updates.source_type = next;
    }
  }

  await db.update(transactions).set(updates).where(eq(transactions.id, id));

  if (params.tagIds !== undefined) {
    // ...unchanged tagIds handling...
  }

  const oldHoldingId = existingRow?.holding_id ?? null;
  const newHoldingId = updates.holding_id;
  if (oldHoldingId) {
    await safeRecomputeHolding(oldHoldingId, { operation: "updateTransaction" });
  }
  if (newHoldingId && newHoldingId !== oldHoldingId) {
    await safeRecomputeHolding(newHoldingId, { operation: "updateTransaction" });
  }
});
```

Everything between the old `const [existingRow] = ...` and the old
`await expo.withTransactionAsync(async () => {` moves inside the callback,
above the `db.update(transactions)...` call (since `updates.source_type`
must be resolved before it's used in `.set(updates)`).

**Verify**: `pnpm typecheck` → exit 0. Confirm by reading the function back
that `existingRow` is declared and used entirely inside the
`withTransactionAsync` callback, with no reference to it outside.

### Step 8: Make `getUnusedSubscriptions()`'s select match its declared type

```ts
const rows = await db
  .select({
    id: subscriptions.id,
    name: subscriptions.name,
    amount: subscriptions.amount,
    billing_day: subscriptions.billing_day,
    billing_days: subscriptions.billing_days,
    category_id: subscriptions.category_id,
    source_id: subscriptions.source_id,
    type: subscriptions.type,
    holding_id: subscriptions.holding_id,
    investment_kind: subscriptions.investment_kind,
    default_units: subscriptions.default_units,
    is_active: subscriptions.is_active,
    created_at: subscriptions.created_at,
    category_name: categories.name,
    source_name: sources.name,
    last_charged: sql<string | null>`MAX(${transactions.date})`,
  })
  .from(subscriptions)
  // ...joins/where/groupBy/having unchanged...
```

The final `return rows as SubscriptionAuditRow[];` stays as-is — the cast
is now honest since every field it claims is actually selected.

**Verify**: `pnpm typecheck` → exit 0. `app/subscriptions/index.tsx`'s
`UnusedSubCard` only reads `.name`/`.amount`/`.last_charged`/`.id`, so no
consumer changes are needed — confirm this with
`grep -n "sub\." app/subscriptions/index.tsx` before/after to make sure
nothing else started depending on the new fields in a way that needs
attention.

## Test plan

No automated test suite exists in this repo. Per-step verification is
typecheck/lint (mechanical correctness) plus the manual smoke checks
described in Steps 1, 2, 6, and 8 (behavioral correctness), run via
`pnpm drizzle:studio` and/or `pnpm ios`/`pnpm android`. Run `pnpm quality`
and `pnpm dead-code` once after all steps land.

## Done criteria

- [ ] `grep -rn "db.delete(transactions)" lib/db/*.ts` — every call site
      (`index.ts` x2, `holdings.ts` x2, `subscriptions.ts` x1) has a
      preceding or accompanying `transactionTags` cleanup in the same
      transaction
- [ ] `deleteSource()` nulls `transactions.source_id`,
      `transactions.destination_source_id`, and `subscriptions.source_id`
      before deleting the row
- [ ] `drizzle/meta/0000_snapshot.json` no longer claims
      `mini_transaction_id_idx` exists on the un-migrated table, and a
      generated `0001_*.sql` migration now creates it (plus any
      duplicate-free name-uniqueness indexes from Step 4)
- [ ] `lib/db/index.ts`'s `initDB()` inline DDL includes
      `IF NOT EXISTS`-guarded `CREATE UNIQUE INDEX` statements matching
      every index Step 4 added to `schema.ts`
- [ ] `findDuplicateTransaction()` uses `format`/`addDays`/`subDays`, no
      `.toISOString()`
- [ ] `updateTransaction()`'s `existingRow` read is inside its
      `withTransactionAsync` callback
- [ ] `getUnusedSubscriptions()`'s `.select()` includes `type`,
      `holding_id`, `investment_kind`, `default_units`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality`, `pnpm dead-code` all
      exit 0 / report clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited function body no longer matches its excerpt above (see Drift
  check).
- Step 4's duplicate pre-check finds existing case-insensitive duplicates
  in any table — skip that table's index, report the duplicates, do not
  attempt to merge/rename rows yourself.
- The generated `0001_*.sql` from Step 4 contains anything beyond the
  expected `CREATE UNIQUE INDEX` statements.
- You find a sixth (or further) `db.delete(transactions)` / bulk-delete
  call site not listed here — report it rather than silently extending
  scope; it likely belongs in this plan but needs the same duplicate/impact
  review as the five already covered.
- The operator wants Option A (global `PRAGMA foreign_keys = ON`) from the
  decision point instead of Option B — stop before Step 1 and confirm
  scope, since it changes this entire plan's approach.

## Maintenance notes

- **`PRAGMA foreign_keys = ON` remains the correct long-term fix** for the
  whole class of cascade bugs this plan patches by hand. It's deliberately
  deferred to a future, dedicated plan that can budget for auditing every
  insert/delete ordering hazard across `lib/db/` and a full manual
  regression pass (add/edit/delete for every entity type on iOS, Android,
  and web) — this repo has no automated test suite to de-risk a change with
  that blast radius. When that plan is picked up, this plan's five
  hand-written `transactionTags` cleanups become redundant (harmless,
  `DELETE` on already-gone rows is a no-op) and can be deleted once the
  pragma is confirmed enforcing correctly everywhere.
- Any new code path that bulk-deletes from `transactions` must also clear
  `transaction_tags` until the pragma flip lands — grep for
  `db.delete(transactions)` before adding a new one and follow the pattern
  in this plan's Step 1.
- The case-insensitive unique indexes added in Step 4 assume no existing
  duplicates. If a table was skipped because duplicates were found, that's
  a standing gap — the operator should decide how to merge/rename before a
  future attempt.
- `withTransactionAsync` is not exclusive (per `expo-sqlite`'s own doc
  comment) — it groups statements for rollback-on-error, not for
  serialization against concurrent calls. Every fix in this plan that uses
  it (Steps 1, 2, 7) inherits that limitation; it's an improvement over the
  prior state, not a guarantee of full atomicity. `withExclusiveTransactionAsync`
  is the real fix for genuine exclusivity but isn't available on web and
  makes concurrent writers fail loudly ("database is locked") rather than
  queue — a bigger, cross-cutting decision for a future plan, not this one.

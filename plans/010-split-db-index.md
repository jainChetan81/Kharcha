# Plan 010: Split the 2,243-line lib/db/index.ts into domain modules behind a stable re-export surface

> **Executor instructions**: Follow this plan step by step. This is a
> MECHANICAL refactor — zero behavior change, zero signature change. Run
> every verification command and confirm the expected result before moving
> to the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/db/index.ts`
> Drift is likely (this file is the repo's hottest). Re-run the export
> inventory command in "Current state" and adjust the move lists; STOP only
> if the file has already been split.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (large mechanical diff; mistakes are import/export slips)
- **Depends on**: plans/001-test-baseline.md recommended (holdings/billing tests give partial coverage); not a hard blocker since the refactor is move-only
- **Category**: tech-debt
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

`lib/db/index.ts` is 2,243 lines — roughly 5× the next-largest db module — and is where every new query lands by default. The repo's own convention (README "lib/db/" section, `.claude/rules/project-conventions.md`) is typed per-domain modules (`subscriptions.ts`, `budgets.ts`, `categories.ts`, …), and `index.ts` already re-exports several of them (lines 2098-2150). Finishing the split shrinks merge conflicts, makes review tractable, and stops the junk-drawer gravity. Because all consumers already import from `lib/db` *via this index*, the split can be invisible to the rest of the codebase.

## Current state

Export inventory (regenerate with `grep -n "^export\|^async function\|^function" lib/db/index.ts`):

- Lines 60-82: re-exports of `db`, types.
- `initDB` (line 90), `hasColumn` (83), `seedDefaults` (403), `seedSampleData` (585) — init + seeding, ~1000 lines.
- `transactionSelect` (1055), `attachTagsToRows` (1096) — shared query helpers used by most transaction queries.
- Transaction queries/mutations: `getRecentTransactions` (1108), `getMonthTransactions` (1123), `getMonthlySummary` (1139), `getBiggestTransaction` (1167), `getTransactionCount` (1197), `getTrackingStreak` (1222), `getTransactionsPaginated` (1249), `getAllTransactionsFiltered` (1351), `getTransactionById` (1357), `insertTransaction` (1374), `updateTransaction` (1462), `deleteTransaction` (1590), `clearAllTransactions` (1618), `findDuplicateTransaction` (1957).
- Reimbursements: `setReimbursementStatus` (1630), `getReimbursementSummary` (1676).
- Insights/aggregations: `getCategoryBreakdown` (1713), `getMerchantBreakdown` (1767), `searchMerchants` (1809), `getTotalMonthlyBudget` (1842), `syncedTransactionExists` (1857), `escapeLikeWildcards` (1885, private), `getMostUsedCategoryForMerchant` (1891), `getMostUsedSourceForMerchant` (1924), `getMonthlyInsights` (1989), `getDailySpend` (2153), `getTodaySpend` (2182), `getPreviousMonthSpendAtDay` (2206).
- Lines 2098-2150: existing re-export blocks from `./banks`, `./budgets`, `./categories`, `./config`, `./sources`, `./stats`, `./subscriptions`, etc. — **this is the pattern to extend.**

Error-handling convention inside this file: every public function wraps in try/catch and calls `logFirebaseError(error, { error_type: ERROR_TYPE.DB, operation: "<fnName>" })` then rethrows — see `searchMerchants` (1833-1838) as the exemplar. Preserve exactly when moving.

Consumers: hooks import from `@/lib/db` (the index) per the data-layer rule ("screens never import from `lib/db/` directly" — hooks do, via the index). Verify no file imports a private symbol: `grep -rn "from \"@/lib/db/index\"" hooks lib app components` should be empty (imports are `@/lib/db`).

Conventions: no `any`; **never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `pnpm typecheck`  | exit 0              |
| Lint      | `pnpm lint`       | exit 0              |
| Dead code | `pnpm dead-code`  | no new findings     |
| Tests     | `pnpm test`       | all pass (if 001 landed) |
| React scan| `pnpm react-doctor:diff` | no errors (runs on pre-push anyway) |

## Scope

**In scope** (create/modify):
- `lib/db/init.ts` (create — `initDB`, `hasColumn`, `seedDefaults`, `seedSampleData`)
- `lib/db/transactions.ts` (create — transaction CRUD/queries + `transactionSelect` + `attachTagsToRows`)
- `lib/db/reimbursements.ts` (create — the two reimbursement functions)
- `lib/db/insights.ts` (create — aggregation/insight/merchant queries + `escapeLikeWildcards`)
- `lib/db/index.ts` (shrinks to re-exports + anything genuinely shared)

**Out of scope** (do NOT touch):
- Function bodies — moves only. No renames, no signature changes, no logic edits (resist fixing things you notice; file them in your report).
- Existing domain modules (`subscriptions.ts`, `budgets.ts`, `holdings.ts`, …).
- Any consumer file (`hooks/`, `app/`, `components/`, `lib/` outside `lib/db/`). If the typecheck forces a consumer change, the split broke the contract — STOP.
- `lib/db/schema.ts`, `connection.ts`, `types.ts`.

## Git workflow

- Branch: `advisor/010-split-db-index`
- One commit per extracted module: `refactor(db): move transaction queries to lib/db/transactions.ts (no behavior change)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

Sequence so the codebase typechecks after every step: move one module at a time, re-export immediately.

### Step 1: Extract init + seeds

Create `lib/db/init.ts`; move `initDB`, `hasColumn`, `seedDefaults`, `seedSampleData` with their imports. In `index.ts`, add `export { initDB, seedSampleData } from "./init";` (keep private helpers private). Watch for module-scope state or shared closures — if any moved function references a module-level variable shared with non-moved code, STOP and report.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Extract transactions

Create `lib/db/transactions.ts`; move the transaction CRUD/queries listed above plus `transactionSelect` and `attachTagsToRows` (check first whether any function staying behind also calls them — if so, export them from `transactions.ts` and import in the staying module). Re-export every previously-exported symbol from `index.ts`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` (if available) → pass.

### Step 3: Extract reimbursements and insights

Same procedure for `reimbursements.ts` (2 functions) and `insights.ts` (the aggregation list, plus private `escapeLikeWildcards`). Note `getAllTransactionsFiltered` may be used by insights functions — choose its home by who calls it (check with grep) and import across modules as needed; cross-imports between `lib/db/*` modules are fine (existing modules already do this).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Verify the surface is unchanged

`index.ts` should now be: the line-60-82 block, re-export blocks (old + new), and any genuinely shared remainder. Compare export surfaces:
`git show 20fc794:lib/db/index.ts | grep -oE "export (async )?(function|const|type) [A-Za-z]+" | sort` vs the same grep on the new index **plus** its re-export lines — every previously exported symbol must still be importable from `@/lib/db`.

**Verify**: surface diff is empty; `wc -l lib/db/index.ts` → under ~400; `pnpm lint`, `pnpm dead-code`, `pnpm typecheck` all clean; `pnpm test` passes if present.

## Test plan

No new tests — move-only. Plan 001's suites (holdings math, billing days) plus typecheck/knip are the regression net. Operator smoke: launch the app, confirm home screen, history, add-transaction, and an insights view all load (touches initDB, paginated queries, breakdowns).

## Done criteria

- [ ] `wc -l lib/db/index.ts` < 400
- [ ] Export-surface comparison (step 4) shows zero removed symbols
- [ ] No file outside `lib/db/` modified (`git status`)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm dead-code` clean; `pnpm test` passes if present
- [ ] Operator smoke test passed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A moved function depends on module-scope mutable state shared with unmoved code.
- Typecheck demands a change in any consumer file (hooks/screens) — the re-export surface was broken; back up and fix the export instead.
- You're tempted to fix a bug you spotted mid-move (e.g. plan 005's items if not yet landed) — don't; note it in the report.
- Circular imports appear between the new modules that can't be resolved by moving a shared helper to a leaf module — report the cycle.

## Maintenance notes

- New db functions now go in their domain module; `index.ts` only re-exports. A review heuristic: a PR adding a function *body* to `index.ts` is wrong.
- Reviewer: this diff is large but should be `git diff --color-moved=dimmed-zebra`-clean — moved blocks plus import/export lines only.
- Deferred: shrinking `initDB`'s inline CREATE TABLE safety net (interacts with the drizzle migration strategy in `docs/DRIZZLE.md`) — explicitly not this plan.

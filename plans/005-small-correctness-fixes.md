# Plan 005: Fix LIKE-wildcard escaping in merchant search and clamp holdings invested total

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/db/index.ts lib/db/holdings.ts lib/db/holdings-math.ts`
> If the cited lines moved, re-locate the two functions by name before
> proceeding; if their bodies differ from the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (test additions land in plan 001's files if 001 is done; otherwise skip the test step)
- **Category**: bug
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

Two small, verified correctness gaps. (1) `searchMerchants` interpolates the raw search term into a `LIKE` pattern without escaping `%`/`_`/`\` — the repo already has an `escapeLikeWildcards` helper 70 lines below, used by two sibling functions, but this one predates it. Searching for a merchant containing `%` or `_` silently widens matches. (2) The holdings sell math can leave `invested` a hair below zero from float rounding when units remain — a one-line clamp keeps the invariant `invested >= 0` everywhere, not just when units hit zero.

## Current state

- `lib/db/index.ts:1809-1840` — `searchMerchants`, the unescaped one:
  ```ts
  const term = `%${searchTerm}%`;                       // ← line 1814, no escaping
  const rows = await db
    .select({ merchant: transactions.merchant, count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(
      and(
        like(transactions.merchant, term),              // ← no ESCAPE clause
        ...
  ```
- `lib/db/index.ts:1883-1887` — the existing helper:
  ```ts
  // Escape LIKE wildcards so merchants containing `%` or `_` (or `\`) don't
  // silently widen the match. Caller wraps the result in `%…%`.
  function escapeLikeWildcards(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
  }
  ```
- `lib/db/index.ts:1896,1905` — the exemplar usage (`getMostUsedCategoryForMerchant`):
  ```ts
  const pattern = `%${escapeLikeWildcards(merchant.toLowerCase())}%`;
  ...
  sql`LOWER(${transactions.merchant}) LIKE ${pattern} ESCAPE '\\'`,
  ```
- `lib/db/holdings.ts:154-163` — the sell branch:
  ```ts
  } else if (kind === INVESTMENT_KIND.SELL) {
    const sellUnits = Math.min(u, units);
    const avgCost = units > 0 ? invested / units : 0;
    units -= sellUnits;
    invested -= sellUnits * avgCost;                    // ← float residue can dip < 0
    if (units <= 0) {
      units = 0;
      invested = 0;
    }
  }
  ```
  Note: if plan 001 already landed, this loop may live in `lib/db/holdings-math.ts` (`foldInvestmentRows`) — apply the fix there instead.
- Repo conventions: no `any`; comments explain why, not what; **never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | all pass (only if plan 001 landed) |

## Scope

**In scope**:
- `lib/db/index.ts` (`searchMerchants` only)
- `lib/db/holdings.ts` or `lib/db/holdings-math.ts` (sell branch only)
- `lib/db/holdings-math.test.ts` (only if plan 001 landed)

**Out of scope** (do NOT touch):
- `getMostUsedCategoryForMerchant` / `getMostUsedSourceForMerchant` — already correct; they are the pattern to copy.
- Any other LIKE usage you find elsewhere — note it in your report instead.
- Recompute call sites (`safeRecomputeHolding` and its callers).

## Git workflow

- Branch: `advisor/005-small-correctness-fixes`
- Commit style: `fix: escape LIKE wildcards in merchant search; clamp holdings invested to zero`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Escape the search term in `searchMerchants`

Change line 1814 to `const term = `%${escapeLikeWildcards(searchTerm)}%`;`. The drizzle `like()` helper does not emit an `ESCAPE` clause, so replace the `like(transactions.merchant, term)` condition with the sql-template form used at line 1905: `sql`${transactions.merchant} LIKE ${term} ESCAPE '\\'``. Keep the rest of the where-clause identical. Note `escapeLikeWildcards` is declared *below* `searchMerchants` in the file — function declarations hoist, no move needed.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 2: Clamp `invested` in the sell branch

After `invested -= sellUnits * avgCost;` add a guard so float residue can't leave a negative total when units remain:

```ts
if (invested < 0) invested = 0;
```

(The existing `units <= 0` reset stays.) Apply in `holdings-math.ts` if plan 001 extracted the fold, otherwise in `holdings.ts`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3 (only if plan 001 landed): regression tests

In `lib/db/holdings-math.test.ts`, add: a sell sequence engineered to produce float residue (e.g. buy 3 units @ 0.1-style amounts, sell 1, assert `invested >= 0`); and assert sell-all still zeroes both fields. No test for `searchMerchants` (db-coupled).

**Verify**: `pnpm test` → all pass including new cases.

## Test plan

Covered in step 3 when available. Manual check for step 1: operator types `100%` into the history merchant search and confirms it matches only merchants containing the literal string `100%`.

## Done criteria

- [ ] `grep -n "escapeLikeWildcards" lib/db/index.ts` shows three call sites (searchMerchants + the two merchant-history functions)
- [ ] Sell branch contains the `invested < 0` clamp
- [ ] `pnpm typecheck` and `pnpm lint` exit 0 (and `pnpm test` if applicable)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Either function body no longer matches its excerpt.
- The sql-template LIKE rewrite changes query results in an obvious way the operator reports during smoke test (e.g. case-sensitivity change — `like()` and raw `LIKE` are both case-insensitive for ASCII in SQLite, but verify if the operator sees different search behavior).

## Maintenance notes

- Any future LIKE query on user-supplied text must use `escapeLikeWildcards` + `ESCAPE '\\'`; consider exporting the helper from a shared module if a fourth call site appears.
- The holdings clamp masks accumulated float drift rather than eliminating it; if portfolio math is ever reworked (e.g. integer paise), remove the clamp and assert instead.

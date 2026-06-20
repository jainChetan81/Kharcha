# Plan 001: Establish a vitest baseline covering parsers, money math, and billing logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/parsers lib/gmail/parsers lib/db/holdings.ts lib/db/subscriptions.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

This repo has **zero tests** — no test framework in `package.json`, no `*.test.ts` anywhere. Verification today is only static (biome, tsc, knip, react-doctor). Meanwhile the riskiest code is exactly the kind tests catch: 12 regex email parsers, 3 regex SMS parsers, investment cost-basis math, and subscription billing-day processing. Recent git history shows repeated bug-fix commits in these areas (`bd160f8` "reimbursable precision", `e04576e` "clamp sell units"). This plan creates the verification baseline; plans 009 (parser consolidation) and 010 (db split) must not start until it lands.

## Current state

- `package.json` — scripts: `lint`, `typecheck`, `quality`, `dead-code`, `local-ci`. No `test` script. No vitest/jest in devDependencies.
- `lib/parsers/` — SMS parsers: `axis.ts`, `hdfc.ts`, `indusind.ts`, `index.ts`, `types.ts`, `utils.ts`. Pure string→object functions. `lib/parsers/index.ts:12-18`:
  ```ts
  export function parseMessage(text: string): ParsedTransaction | null {
    for (const parser of ALL_PARSERS) {
      const result = parser(text);
      if (result) return result;
    }
    return null;
  }
  ```
- `lib/gmail/parsers/` — email parsers for 12 banks (`axis.ts`, `citi.ts`, `fintech-cards.ts`, `hdfc.ts`, `hsbc.ts`, `icici.ts`, `idfc.ts`, `indusind.ts`, `kotak.ts`, `sbi.ts`, `sc.ts`) plus `utils.ts` and `index.ts`. **Caution**: `lib/gmail/parsers/index.ts` imports `parseWithGemini` from `@/lib/gemini/client`, which imports `@/lib/env`, which imports `react-native` (`Alert`). Test the per-bank parser modules directly, NOT the index. `utils.ts` imports only `date-fns` and `@/lib/constants`.
- `lib/db/holdings.ts:119-171` — `recomputeHoldingFromTransactions` contains a pure fold over investment rows (buy/sell/units/cost-basis) embedded in a db-coupled function:
  ```ts
  let units = 0;
  let invested = 0;
  for (const row of rows) {
    ...
    if (kind === INVESTMENT_KIND.BUY) { units += u; invested += amt; }
    else if (kind === INVESTMENT_KIND.SELL) {
      const sellUnits = Math.min(u, units);
      const avgCost = units > 0 ? invested / units : 0;
      units -= sellUnits;
      invested -= sellUnits * avgCost;
      if (units <= 0) { units = 0; invested = 0; }
    }
  }
  ```
- `lib/db/subscriptions.ts` — `parseBillingDays` (around line 53, module-internal) parses the `billing_days` JSON column with fallback to legacy `billing_day`; `processSubscriptions` (line 213) clamps `effectiveDay = Math.min(day, daysInMonth)` — the behavior to characterize (e.g. billing day 31 in a 30-day month posts on the 30th).
- `tsconfig.json` — `strict: true`, path alias `"@/*": ["./*"]`, excludes `kharcha-backend`.
- `knip.json` — `entry: ["app/**/*.{ts,tsx}"]`; vitest config + test files will need to be added so knip doesn't flag them.
- Repo conventions (`CLAUDE.md`): no `any` types; **never run pnpm commands yourself — tell the user which command to run and wait for them to confirm the result.**

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Lint      | `pnpm lint`              | exit 0              |
| Dead code | `pnpm dead-code`         | no new vitest-related findings |
| Tests     | `pnpm test` (created in step 1) | all pass     |

Repo convention: ask the operator to run pnpm commands and report output rather than running them yourself, unless your harness has explicit permission.

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (add vitest devDependency + `test` script; extend `local-ci`)
- `vitest.config.ts` (create)
- `knip.json` (add vitest entry/ignore so dead-code stays green)
- `lib/parsers/*.test.ts` (create)
- `lib/gmail/parsers/*.test.ts` (create)
- `lib/db/holdings-math.ts` (create — extracted pure fold) and `lib/db/holdings.ts` (only to call the extracted function)
- `lib/db/holdings-math.test.ts` (create)
- `lib/db/subscriptions.ts` (only to export `parseBillingDays` for testing, or move it to a small pure module)
- `lib/db/billing-days.test.ts` (create)
- `.github/workflows/ci.yml` (add test step)

**Out of scope** (do NOT touch):
- Any parser regex or parsing behavior — these are **characterization tests**: they lock in current behavior, bugs included. If a test reveals a bug, record it in the test as `// BUG(characterized): ...` and report it; do not fix it here.
- `kharcha-backend/` — backend tests are a follow-up (see plan 009 maintenance notes).
- Hooks, screens, components — no UI testing in this plan.

## Git workflow

- Branch: `advisor/001-test-baseline`
- Commit style: conventional, lowercase — e.g. `test: add vitest baseline for parsers, holdings math, billing days` (matches `git log` style like `chore: integrate react-doctor with pre-push hook`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install and configure vitest

Add `vitest` to devDependencies. Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

Add to `package.json` scripts: `"test": "vitest run"`. Extend `local-ci` to include `pnpm test` after `pnpm quality`. Add `vitest.config.ts` to knip `entry` and `vitest` to its known deps if knip flags it.

**Verify**: `pnpm test` → "no test files found" exit (or 0 tests); `pnpm typecheck` → exit 0.

### Step 2: Smoke-test that parser modules load under node

Create `lib/parsers/index.test.ts` with a single test importing `parseMessage` and asserting `parseMessage("hello") === null`. Create `lib/gmail/parsers/axis.test.ts` importing `AXIS_PARSERS` directly from `@/lib/gmail/parsers/axis` and asserting it is a non-empty array.

**Verify**: `pnpm test` → 2 tests pass. If either import fails because a transitive module pulls in `react-native`, STOP (see STOP conditions).

### Step 3: Characterization tests for SMS parsers

For each of `lib/parsers/axis.ts`, `hdfc.ts`, `indusind.ts`: read the regexes, construct 2–4 realistic sample SMS strings per parser that match them (derive from the regex; e.g. Axis debit format `INR 450.00 debited ... 07-04-26 ...`), and assert the full returned `ParsedTransaction` object (amount, type, merchant, date). Add one negative case per bank (OTP-style message → `null`). Also test `lib/parsers/utils.ts` date helpers (`parseAxisDate("07-04-26")` → `"2026-04-07"`; `parseHdfcDate` happy + non-matching input fallback).

**Verify**: `pnpm test` → all pass, ≥12 new tests.

### Step 4: Characterization tests for email parsers

Same approach for each bank module in `lib/gmail/parsers/` (test the exported `*_PARSERS` arrays via `tryParsers` from `lib/gmail/parsers/utils.ts`, or call parsers directly). Minimum: 1 happy-path + 1 null case per bank (11 modules). Test `decodeHtmlEntities` and the date utilities in `lib/gmail/parsers/utils.ts`.

**Verify**: `pnpm test` → all pass, ≥22 new tests.

### Step 5: Extract and test the holdings fold

Create `lib/db/holdings-math.ts` exporting a pure function:

```ts
export type InvestmentRowInput = { kind: string | null; amount: number; units: number | null };
export function foldInvestmentRows(rows: InvestmentRowInput[], unitless: boolean): { units: number; invested: number }
```

Move the loop body from `lib/db/holdings.ts:119-164` into it verbatim (including the NaN handling — pass a `onCorruptRow` callback or return a `corrupt: boolean` flag so the Firebase logging stays in `holdings.ts`). `recomputeHoldingFromTransactions` calls the new function; its observable behavior must not change. Tests in `lib/db/holdings-math.test.ts`: buy-only; buy+partial sell (cost basis reduces proportionally); sell-all (units and invested reset to 0); oversell (sellUnits clamped); unitless FD buy/sell with floor at 0; NaN amount row treated as 0.

**Verify**: `pnpm test` → all pass; `pnpm typecheck` → exit 0; `git diff lib/db/holdings.ts` shows only the extraction, no logic change.

### Step 6: Test billing-day parsing and clamping

Export `parseBillingDays` from `lib/db/subscriptions.ts` (or move it to `lib/db/billing-days.ts` if it has no db imports — preferred). Tests: valid JSON array sorted+deduped+range-filtered; malformed JSON falls back to `[billing_day]`; out-of-range legacy value behavior (characterize whatever it currently does); and a pure helper test for the clamp rule `Math.min(day, daysInMonth)` if you extract it.

**Verify**: `pnpm test` → all pass.

### Step 7: Wire into CI

Add a test step to `.github/workflows/ci.yml` after the typecheck step (mirror the existing step format in that file — read it first).

**Verify**: `pnpm lint` → exit 0; `pnpm dead-code` → no new findings; YAML parses (`node -e "require('js-yaml')"` not needed — visual check + CI on push).

## Test plan

This plan IS the test plan. Final count expectation: ≥40 tests across SMS parsers, email parsers, holdings math, billing days. All characterization — no behavior changes outside the mechanical extraction in step 5.

## Done criteria

- [ ] `pnpm test` exits 0 with ≥40 tests
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm dead-code` reports no new items
- [ ] `git diff lib/db/holdings.ts` contains no behavioral change (extraction only)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Importing any parser module in a node test pulls in `react-native` (e.g. via `@/lib/constants`). Report which import chain breaks; do not mock react-native wholesale — the fix decision (split constants, vitest alias shim) belongs to the maintainer.
- A characterization test reveals a parser returning clearly wrong data (e.g. amount off by 100×). Record it, mark `// BUG(characterized)`, and list it in your report.
- `parseBillingDays` turns out to require db imports that can't be cleanly separated.
- Extracting the holdings fold requires touching `safeRecomputeHolding` callers.

## Maintenance notes

- Every future parser change must update its characterization tests — this is the point.
- Plan 005 changes `lib/db/holdings.ts` sell-branch clamping; its test additions belong in `holdings-math.test.ts` created here.
- Plan 009 (parser consolidation) will reorganize parser files; tests move with them and are the safety net.
- Deferred: backend (`kharcha-backend`) tests via `bun:test`; integration tests against a real SQLite db (drizzle + better-sqlite3) for `processSubscriptions` — worth a follow-up plan if subscription bugs recur.

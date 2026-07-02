# Plan 009: Consolidate duplicated parser utilities in the app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/parsers lib/gmail/parsers`
> If parser files changed since planning, re-read the affected ones and
> reconcile; STOP on structural mismatch (files renamed/merged).
>
> **Note**: originally this plan also covered `kharcha-backend/src/lib/parsers`
> drift testing under bun:test — the backend was removed in `c7eb9f5`, so the
> plan is now app-only.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-test-baseline.md (MUST be DONE — its characterization tests are the safety net for every move in this plan)
- **Category**: tech-debt
- **Planned at**: commit `20fc794`, 2026-06-10; rescoped app-only after `c7eb9f5`

## Why this matters

Bank-parsing logic exists in two places: `lib/parsers/` (SMS, 3 banks) and
`lib/gmail/parsers/` (email, 12 banks). The utility layer is already visibly
drifting: `lib/parsers/utils.ts` and `lib/gmail/parsers/utils.ts` both define
`parseAmount`, `parseAxisDate`, `parseHdfcDate` with different signatures and
behavior (the gmail `parseAxisDate` takes a `rawTime` param and uses date-fns;
the SMS one does not), and `lib/gmail/parsers/utils.ts` defines a *different*
`ParsedTransaction` type and its own helpers. A bank changing its email/SMS
format means fixing up to two places, and history says only one gets fixed.

The achievable goals: (1) one utils module inside the app, (2) shared test
fixtures that run against the app parsers (vitest), so drift becomes a failing
test instead of a silent divergence.

## Current state

- `lib/parsers/` — `axis.ts`, `hdfc.ts`, `indusind.ts`, `index.ts` (exports `parseMessage`, tries `ALL_PARSERS` in order), `types.ts`, `utils.ts`. Used by the paste/share parsing paths (`grep -rn "from \"@/lib/parsers\"" app hooks lib` to enumerate callers before moving anything).
- `lib/gmail/parsers/` — 11 bank modules + `fintech-cards.ts` (ONECARD/SLICE/UNI) + `utils.ts` + `index.ts` (`parseEmailWithFallback`, `PARSER_MAP` keyed by `parser_key` from the banks table). Its `utils.ts` defines `ParsedTransaction` (email flavor: `merchant`, `date: string | null`, optional category/confidence/subscription fields), `Parser`, `tryParsers`, `decodeHtmlEntities`, date helpers using date-fns.
- `lib/parsers/types.ts` — the SMS `ParsedTransaction` (different shape from the email one — do NOT merge the two types; they model different sources).
- Plan 001 created: `lib/parsers/*.test.ts`, `lib/gmail/parsers/*.test.ts` with characterization fixtures.
- Conventions: app imports use `@/` alias. **Never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose            | Command (where)                      | Expected on success |
|--------------------|--------------------------------------|---------------------|
| App tests          | `pnpm test` (root)                   | all pass            |
| App typecheck/lint | `pnpm typecheck` / `pnpm lint` (root)| exit 0              |
| App dead code      | `pnpm dead-code` (root)              | no new findings     |

## Scope

**In scope**:
- `lib/parsers/**` and `lib/gmail/parsers/**` (reorganize utils; keep public entry points `parseMessage` and `parseEmailWithFallback` stable)
- `fixtures/bank-messages/**` (create — shared JSON fixtures at repo root)
- Test files created by plan 001 (update import paths if utils move)

**Out of scope** (do NOT touch):
- Parser regexes / parsing behavior — zero behavior change; characterization tests must pass unmodified except for import paths.
- Merging the SMS and email `ParsedTransaction` types — they differ on purpose.
- `lib/gmail/sync.ts`, `lib/gemini/client.ts` — consumers, not parsers.

## Git workflow

- Branch: `advisor/009-parser-drift-control`
- Commit per step; style: `refactor(parsers): single shared utils inside the app`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Map every consumer

Before moving anything: `grep -rn "lib/parsers\|lib/gmail/parsers" --include="*.ts" --include="*.tsx" app hooks lib components | grep -v test` — record the import surface in your report. The two public entry points (`parseMessage`, `parseEmailWithFallback`) and the two `ParsedTransaction` types are the contract; everything else may move.

**Verify**: list produced; no consumer imports a bank module directly (if one does, note it — it joins the contract).

### Step 2: Single utils module inside the app

Create `lib/parsers/shared.ts` holding the duplicated primitives (`parseAmount`, `parseAxisDate`, `parseHdfcDate`, and any other function that exists near-identically in both `lib/parsers/utils.ts` and `lib/gmail/parsers/utils.ts` — diff them first). Re-export from both existing `utils.ts` files so no bank module's imports change, then (optional, if churn is small) point bank modules at `shared.ts` directly. Where the two copies differ, keep BOTH behaviors and write a characterization test capturing the difference — do not "fix" the divergence silently; report it.

**Verify**: `pnpm test` → all plan-001 tests still pass; `pnpm typecheck`, `pnpm lint`, `pnpm dead-code` → clean.

### Step 3: Extract shared fixtures

Move the sample messages from plan 001's test files into `fixtures/bank-messages/<bank>.json`:

```json
[
  {
    "kind": "email",
    "bank": "axis",
    "body": "<sample text>",
    "expected": { "amount": 450, "type": "expense", "merchant": "...", "date": "2026-04-07" }
  }
]
```

Rewrite the app parser tests to load these fixtures (vitest can import JSON directly). Same assertions as before — green must stay green.

**Verify**: `pnpm test` → same test count as before step 3, all passing.

## Test plan

This plan is test-infrastructure-heavy by design. Net result: every bank fixture exercises the app's parsers (SMS and email flavors). New fixture rule for the future: a parser change without a fixture update fails review.

## Done criteria

- [ ] One copy of each shared primitive inside the app (`grep -rn "function parseAxisDate" lib/` → exactly 1)
- [ ] `fixtures/bank-messages/` exists and the test suite consumes it
- [ ] `pnpm test` passes
- [ ] `pnpm quality` and `pnpm dead-code` clean at root
- [ ] Zero behavior change in any parser (characterization tests unmodified except paths/fixture loading)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 001 is not DONE — this plan must not start without the characterization net.
- The two app copies of a utility (`lib/parsers/utils.ts` vs `lib/gmail/parsers/utils.ts`) differ in *behavior* (not just comments/formatting) — report the exact divergence with examples before unifying anything; the maintainer decides which behavior wins.

## Maintenance notes

- Adding a bank now means: bank module in `lib/gmail/parsers/`, fixture file — the fixture test covers it.
- Reviewer: confirm no regex changed (`git diff` over bank modules should show import-line changes only).

# Plan 009: Consolidate duplicated parser utilities in the app and put backend parser drift under test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/parsers lib/gmail/parsers kharcha-backend/src/lib/parsers`
> If parser files changed since planning, re-read the affected ones and
> reconcile; STOP on structural mismatch (files renamed/merged).

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-test-baseline.md (MUST be DONE — its characterization tests are the safety net for every move in this plan)
- **Category**: tech-debt
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

Bank-parsing logic exists in three places: `lib/parsers/` (SMS, 3 banks), `lib/gmail/parsers/` (email, 12 banks), and `kharcha-backend/src/lib/parsers/` (email, 3 banks — a hand-copied subset of the app's email parsers, in a different runtime). The utility layer is already visibly drifting: `lib/parsers/utils.ts` and `kharcha-backend/src/lib/parsers/utils.ts` contain near-identical copies of `parseAmount`, `parseAxisDate`, `parseHdfcDate` (the backend copy has comments the app copy lost), while `lib/gmail/parsers/utils.ts` defines a *different* `ParsedTransaction` type and its own helpers. A bank changing its email/SMS format means fixing up to three places, and history says only one gets fixed.

Full unification into one shared package is NOT this plan — the backend is a separate Bun/tsconfig world and a workspace restructure isn't justified yet. The achievable goals: (1) one utils module inside the app, (2) shared test fixtures that run against BOTH the app parsers (vitest) and the backend parsers (bun:test), so drift becomes a failing test instead of a silent divergence.

## Current state

- `lib/parsers/` — `axis.ts`, `hdfc.ts`, `indusind.ts`, `index.ts` (exports `parseMessage`, tries `ALL_PARSERS` in order), `types.ts`, `utils.ts`. Used by the SMS capture paths (`grep -rn "from \"@/lib/parsers\"" app hooks lib` to enumerate callers before moving anything).
- `lib/gmail/parsers/` — 11 bank modules + `fintech-cards.ts` (ONECARD/SLICE/UNI) + `utils.ts` + `index.ts` (`parseEmailWithFallback`, `PARSER_MAP` keyed by `parser_key` from the banks table). Its `utils.ts` defines `ParsedTransaction` (email flavor: `merchant`, `date: string | null`, optional category/confidence/subscription fields), `Parser`, `tryParsers`, `decodeHtmlEntities`, date helpers using date-fns.
- `lib/parsers/utils.ts` vs `kharcha-backend/src/lib/parsers/utils.ts` — compare: `diff <(sed 's/\t/  /g' kharcha-backend/src/lib/parsers/utils.ts) lib/parsers/utils.ts` to see the current drift precisely.
- `lib/parsers/types.ts` — the SMS `ParsedTransaction` (different shape from the email one — do NOT merge the two types; they model different sources).
- Plan 001 created: `lib/parsers/*.test.ts`, `lib/gmail/parsers/*.test.ts` with characterization fixtures.
- Backend test runner: none yet; Bun ships `bun:test` natively.
- Conventions: app imports use `@/` alias; backend uses relative imports, tabs, double quotes. **Never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose            | Command (where)                      | Expected on success |
|--------------------|--------------------------------------|---------------------|
| App tests          | `pnpm test` (root)                   | all pass            |
| App typecheck/lint | `pnpm typecheck` / `pnpm lint` (root)| exit 0              |
| App dead code      | `pnpm dead-code` (root)              | no new findings     |
| Backend tests      | `bun test` (kharcha-backend/)        | all pass            |
| Backend quality    | `bun run quality` (kharcha-backend/) | exit 0              |

## Scope

**In scope**:
- `lib/parsers/**` and `lib/gmail/parsers/**` (reorganize utils; keep public entry points `parseMessage` and `parseEmailWithFallback` stable)
- `fixtures/bank-messages/**` (create — shared JSON fixtures at repo root)
- `kharcha-backend/src/lib/parsers/*.test.ts` (create), `kharcha-backend/package.json` (add test script)
- Test files created by plan 001 (update import paths if utils move)

**Out of scope** (do NOT touch):
- Parser regexes / parsing behavior — zero behavior change; characterization tests must pass unmodified except for import paths.
- Merging the SMS and email `ParsedTransaction` types — they differ on purpose.
- A pnpm/bun workspace restructure or shared npm package — explicitly deferred.
- `lib/gmail/sync.ts`, `lib/gemini/client.ts` — consumers, not parsers.

## Git workflow

- Branch: `advisor/009-parser-drift-control`
- Commit per step; style: `refactor(parsers): single shared utils inside the app`, `test(backend): run shared bank fixtures under bun:test`
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

### Step 4: Backend tests consume the same fixtures

In `kharcha-backend`, add `"test": "bun test"` to package.json scripts. Create `src/lib/parsers/fixtures.test.ts` that loads `../../../../fixtures/bank-messages/*.json` (relative path out of the backend into the repo root — verify Bun resolves it; if the backend is ever deployed from a Docker context that excludes the parent dir, the test only runs in dev, which is fine — note it). For each fixture with `kind: "email"` and a bank the backend supports (axis, hdfc, indusind), run the backend's `parseEmail` and assert the parsed amount/type/date match `expected`. Where the backend legitimately differs in output shape, map fields in the test — but a differing *value* (amount, date) is a real drift bug: characterize it with a `// DRIFT:` comment and report it.

**Verify**: `bun test` in `kharcha-backend/` → passes (or fails only on `// DRIFT:` cases you've documented and reported); `bun run quality` → exit 0.

### Step 5: Wire backend tests into local-ci visibility

Add a line to `kharcha-backend/README.md` documenting `bun test`. If `kharcha-backend` has CI (check for workflow files referencing it), add the test step there; if not, just the README line.

**Verify**: documentation present; root `pnpm quality` unaffected.

## Test plan

This plan is test-infrastructure-heavy by design. Net result: every bank fixture exercises the app's parser AND (for the 3 shared banks) the backend's parser. New fixture rule for the future: a parser change without a fixture update fails review.

## Done criteria

- [ ] One copy of each shared primitive inside the app (`grep -rn "function parseAxisDate" lib/` → exactly 1)
- [ ] `fixtures/bank-messages/` exists and both test suites consume it
- [ ] `pnpm test` and `bun test` both pass (DRIFT-documented failures resolved or explicitly reported)
- [ ] `pnpm quality` and `pnpm dead-code` clean at root; `bun run quality` clean in backend
- [ ] Zero behavior change in any parser (characterization tests unmodified except paths/fixture loading)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 001 is not DONE — this plan must not start without the characterization net.
- The app/backend copies of a utility differ in *behavior* (not just comments/formatting) — report the exact divergence with examples before unifying anything; the maintainer decides which behavior wins.
- Bun cannot import the repo-root fixtures from inside `kharcha-backend` — report the resolution error rather than copying fixtures (a copy recreates the drift problem).
- Step 4 reveals the backend parses a fixture to a *different value* than the app — that's a live drift bug; report it, mark `// DRIFT:`, continue with the rest.

## Maintenance notes

- Adding a bank now means: bank module in `lib/gmail/parsers/`, fixture file, and (if backend-supported) nothing extra — the fixture test covers it.
- The deferred end-state remains a shared workspace package if the backend grows past 3 banks; the fixtures built here transfer directly to that world.
- Reviewer: confirm no regex changed (`git diff` over bank modules should show import-line changes only).

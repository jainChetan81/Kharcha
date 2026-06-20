# Plan 008: Refresh README and .env.example to match the actual codebase

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- README.md .env.example lib/db/schema.ts`
> Drift here is fine (docs work is additive) — just re-verify each claimed
> staleness below against the live tree before fixing it.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (coordinate with plan 003: it may add/remove `EXPO_PUBLIC_GEMINI_API_KEY` in `.env.example` — check `plans/README.md` status first)
- **Category**: docs
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

The README is actively wrong in ways that mislead anyone (human or agent) using it as a map: it claims 8 database tables (there are 11), references a deleted file (`lib/version.ts`), and its project-structure section predates several screens and modules. `.env.example` lists a variable the app never reads. Wrong docs are worse than missing docs — agents and contributors trust them.

## Current state

Verified stale items (each re-verifiable with the command shown):

1. **Table count + list.** `README.md:141` says "8 tables in `lib/db/schema.ts`" and lists 8. Actual: 11 — verify with `grep -c "sqliteTable(" lib/db/schema.ts` → 11. Missing from README: `holdings` (schema.ts:48), `tags` (schema.ts:146), `transaction_tags` (schema.ts:159). The `transactions` column list at README:147 is also stale (schema now includes `holding_id`, `investment_kind`, `units`, `reimbursement_status`, `reimbursable_amount` — read `lib/db/schema.ts:75-114` and transcribe the real columns).
2. **Deleted file referenced.** `README.md:129` lists `lib/version.ts   compareVersions, isUpgrade, isMajorUpgrade` — deleted in commit `439ca05`. Verify: `ls lib/version.ts` → no such file.
3. **Structure section drift.** `README.md:47-135` — written against an older tree. Examples: `app/config.tsx` is now the `app/config/` directory; `components/currency-picker.tsx` no longer exists; screens missing entirely: `insights.tsx`, `portfolio.tsx`, `reimbursements.tsx`, `budgets.tsx` variants, `holding/`, `tag/`, `sms-sync.tsx`, `sms-listener.tsx`, `sms-forward.tsx`; hooks list (README:86-101) names ~14 of the actual 33 files in `hooks/`; `lib/db/` list misses `holdings.ts`, `tags.ts`, `files.ts`, `inspect.ts`. Verify with `ls app components hooks lib/db`.
4. **.env.example orphan.** `.env.example` lists `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, but `lib/env.ts` never reads it. Verify: `grep -rn "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v .env` → if zero hits (check `app.json` and any google-signin config especially), the variable is dead and should be removed from `.env.example`; if it IS consumed somewhere (e.g. native config, `@react-native-google-signin` setup), instead add it to `lib/env.ts` validation following the exact pattern of `GOOGLE_IOS_CLIENT_ID` at `lib/env.ts:14,21-24`.

Conventions: README is lowercase-heading, terse style — match it. **Never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Lint      | `pnpm lint`      | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0 (only needed if lib/env.ts changes) |

## Scope

**In scope**:
- `README.md`
- `.env.example`
- `lib/env.ts` (only the conditional branch of item 4)

**Out of scope** (do NOT touch):
- `docs/*.md` — only fix them if you find a claim that is provably wrong *while verifying the items above*; otherwise leave them.
- `CLAUDE.md`, `.claude/rules/` — agent-instruction files are the operator's.
- Feature behavior of any kind.

## Git workflow

- Branch: `advisor/008-docs-refresh`
- Commit style: `docs: sync README structure/tables with actual tree; prune dead env var`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the database section

Update README:139-154: table count to 11, add the three missing tables with their real columns (read `lib/db/schema.ts` — transcribe, don't guess), refresh the `transactions` column list.

**Verify**: every table name in the README appears in `grep "sqliteTable(" lib/db/schema.ts` output, and vice versa.

### Step 2: Regenerate the structure section

Rewrite README:47-135 from the live tree (`ls app app/settings components components/ui hooks lib lib/db lib/gmail lib/parsers lib/gemini lib/cloud-backup lib/export kharcha-backend/src`). Keep the existing format (path + one-line description). For files you can't describe confidently from their name, open them and read the header comment or main export. Remove the `lib/version.ts` line. Keep descriptions to one line each; don't editorialize.

**Verify**: `grep -n "version.ts" README.md` → no matches; spot-check 5 random listed paths exist (`ls <path>`).

### Step 3: Reconcile .env.example

Apply item 4's verified branch (remove the dead var, or wire it into `lib/env.ts`). Also confirm every variable `lib/env.ts` reads appears in `.env.example` with a placeholder (currently: IOS_CLIENT_ID, WEB_CLIENT_ID, API_URL, plus GEMINI key depending on plan 003's outcome — check `plans/README.md` for plan 003's status and don't fight its change).

**Verify**: `pnpm typecheck` → exit 0 (if lib/env.ts changed); every `process.env.EXPO_PUBLIC_*` literal in `lib/env.ts` has a matching line in `.env.example` (manual cross-check, list them in your report).

## Test plan

None — documentation only. The verification greps are the gates.

## Done criteria

- [ ] README table section matches `lib/db/schema.ts` exactly (names + count)
- [ ] No reference to deleted files in README (`version.ts`, `currency-picker`)
- [ ] Structure section paths all exist on disk
- [ ] `.env.example` ↔ `lib/env.ts` reconciled per the verified branch of item 4
- [ ] `pnpm lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` is consumed somewhere ambiguous (e.g. referenced in a native config you can't trace) — report the location instead of guessing.
- The README has been substantially rewritten since `20fc794` (drift check shows large diffs) — re-audit which items still apply and report before editing.

## Maintenance notes

- The structure section will drift again; consider (follow-up, not this plan) a script that generates it, or trimming it to top-level directories only so there's less to go stale.
- Reviewer: check the table column lists against schema.ts — transcription errors here would re-poison the docs.

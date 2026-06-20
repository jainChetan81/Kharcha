# Plan 003: Resolve the Gemini API key exposure (decision gate: direct client calls vs backend proxy)

> **Executor instructions**: This plan starts with a DECISION GATE that only
> the operator (repo owner) can answer. Ask it first; do not pick a path
> yourself. Follow the chosen path's steps, run every verification command,
> and honor the STOP conditions. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git status --short lib/gemini/client.ts lib/env.ts .env.example` and `git diff --stat 20fc794..HEAD -- lib/gemini lib/env.ts kharcha-backend/src/routes/ai.ts`
> This plan was written while `lib/gemini/client.ts` and `lib/env.ts` had
> UNCOMMITTED changes. If those changes have since been committed, reverted,
> or further edited, re-read both files before proceeding and reconcile with
> the "Current state" section; on fundamental mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S (path A) / S (path B)
- **Risk**: LOW
- **Depends on**: none — but requires operator input before any change
- **Category**: security
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

At commit `20fc794`, the app calls Gemini through an authenticated backend proxy (`kharcha-backend/src/routes/ai.ts`) — the API key lives only on the server. The **uncommitted working-tree changes** rewrite `lib/gemini/client.ts` (83 → 333 lines) to call the Gemini API directly from the app using `EXPO_PUBLIC_GEMINI_API_KEY`, which Expo inlines into the JS bundle — extractable from any IPA/APK. The author's own TODO in the working-tree `lib/env.ts:16-18` acknowledges this: "extractable from the IPA/APK. Move Gemini calls behind an authed backend proxy before shipping to non-internal users." An extracted key lets anyone burn the key owner's Gemini quota/billing. For a personal-use app this may be an acceptable trade (it removes the deployed-backend dependency), but it should be a deliberate, mitigated decision — not an accident of an unfinished migration.

## Current state

- `lib/gemini/client.ts` @ HEAD (`git show 20fc794:lib/gemini/client.ts`) — proxy client: imports `apiFetchAuthed` from `@/lib/device`, posts to the backend, 30s timeout. Comment: "Backend response mirrors this shape (see kharcha-backend/src/routes/ai.ts)".
- `lib/gemini/client.ts` @ working tree — direct client: builds the prompt locally, calls `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` with `x-goog-api-key: env.GEMINI_API_KEY`, zod-validates the response.
- `lib/env.ts` @ working tree (lines 16-19, 29-32) — adds `GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY` with the security TODO comment.
- `.env.example` — contains `EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key` placeholder (no real value; real `.env` is gitignored).
- `kharcha-backend/src/routes/ai.ts` — the existing authed proxy route (device auth via `x-device-id`, see `kharcha-backend/src/lib/auth.ts`).
- Callers of `parseWithGemini`: `lib/gmail/parsers/index.ts` (email fallback), and the share-intent/SMS parse flows. The exported signature `parseWithGemini(text, categoryNames)` is the contract both versions honor.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |

Repo convention: ask the operator to run pnpm commands and report output.

## Decision gate (ask the operator verbatim)

> Your working tree moves Gemini calls off the backend proxy and back into
> the app with a bundled `EXPO_PUBLIC_*` key. Which direction is intended?
> **A.** Keep direct client calls (drop the proxy dependency) — I'll add key
> hygiene mitigations and documentation.
> **B.** Keep the proxy (HEAD behavior) — your working-tree client.ts changes
> need to be reconciled by you first; I'll then remove the bundled-key path
> from env.ts and document the proxy as the only path.

## Scope

**In scope** (path-dependent):
- Path A: `docs/` (new or existing security note), `lib/env.ts` (comment update), `README.md` (one line in setup), report-only items for the operator (Google Cloud console steps).
- Path B: `lib/env.ts` (remove `GEMINI_API_KEY` export once operator has reverted/reconciled their client.ts), `docs/` note.

**Out of scope** (do NOT touch):
- **The operator's uncommitted `lib/gemini/client.ts` work — never revert, stash, or edit another person's in-flight changes.** All code steps below apply only after the operator has committed their chosen direction.
- `kharcha-backend/src/routes/ai.ts` — hardening it is plan 006's territory.
- Key values: never write any real key into any file. Reference by env-var name only.

## Git workflow

- Branch: `advisor/003-gemini-key` (create only after the operator commits their direction)
- Commit style: `docs: document gemini key handling and restriction requirements` / `chore: drop bundled gemini key path`
- Do NOT push or open a PR unless the operator instructed it.

## Steps — Path A (direct client calls stay)

### Step A1: Operator actions (report these; you cannot do them)

Hand the operator this checklist:
1. In Google Cloud console → Credentials, **restrict** the Gemini API key: Application restriction = iOS bundle ID (and Android package name + SHA-1 if Android builds use it); API restriction = Generative Language API only.
2. If the key was ever the same one used server-side by the backend proxy, **rotate** it: issue a separate, restricted client key; keep the server key server-only.
3. Confirm the real key exists only in local `.env` (gitignored) and EAS secrets — `git log --all -p -- .env*` should show no real value.

### Step A2: Update the code comment to reflect the decision

In `lib/env.ts`, replace the `TODO(security)` comment (lines 16-18 of the working tree version) with a statement of the accepted trade-off, e.g.: "Deliberate: this key ships in the client bundle. It MUST be a key restricted to the Generative Language API + this app's bundle ID (see docs/SECURITY.md). Do not reuse the backend's key here." Create `docs/SECURITY.md` (or extend an existing doc if one fits better) with the restriction/rotation checklist from A1.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -rn "TODO(security)" lib/` → no matches.

## Steps — Path B (proxy stays)

### Step B1: Wait for the operator to reconcile their working tree

The operator decides what happens to the uncommitted direct-call client. Only proceed when `git status` is clean for `lib/gemini/client.ts` and the committed version calls the proxy (`apiFetchAuthed`).

### Step B2: Remove the bundled-key plumbing

If `lib/env.ts` still exports `GEMINI_API_KEY` from `EXPO_PUBLIC_GEMINI_API_KEY`, remove that export and its `warnIfMissing` entry; remove `EXPO_PUBLIC_GEMINI_API_KEY` from `.env.example` (keep backend-side `GEMINI_API_KEY` documentation in `kharcha-backend/.env.example`). Add a line to `docs/GMAIL_SYNC.md` or `README.md`: AI parsing requires the backend (`EXPO_PUBLIC_API_URL`).

**Verify**: `pnpm typecheck` → exit 0; `grep -rn "EXPO_PUBLIC_GEMINI_API_KEY" --include="*.ts" --include="*.tsx" .` (excluding node_modules) → no matches.

## Test plan

No unit tests — this is configuration/documentation. The verification greps above are the machine checks. Operator manually confirms AI parse still works in the app after their chosen path (share-sheet parse or gmail-sync fallback).

## Done criteria

- [ ] Operator answered the decision gate; the answer is recorded in `plans/README.md` next to this plan's status
- [ ] Path-specific greps above pass
- [ ] No real key value appears anywhere in the repo (`git grep -I "AIza"` → only `google-services.json`/plist Firebase config, which plan 007 handles, or nothing)
- [ ] `pnpm typecheck` and `pnpm lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator hasn't answered the decision gate — this plan cannot start without it.
- `lib/gemini/client.ts` working-tree state differs fundamentally from both versions described above (a third direction is in flight).
- You find a real-looking API key committed anywhere while grepping — report file:line and credential type only; never copy the value.

## Maintenance notes

- If the app ever ships to other users (TestFlight external, App Store), path A's restriction mitigations are insufficient — revisit the proxy (the TODO's original intent).
- Whichever path wins, `kharcha-backend/src/routes/ai.ts` either becomes dead code (path A — consider deleting it in a follow-up) or the only path (path B — plan 006 hardens its surroundings).

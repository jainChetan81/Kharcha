# Plan 002: Make backup import crash-safe (never delete the live DB before the replacement is in place)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/db/backup.ts lib/db/files.ts hooks/use-cloud-backup.ts app/export.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

`commitImport` replaces the live SQLite database by **deleting it first, then copying** the picked backup over. If the app crashes, is force-killed, or the OS suspends it between the delete and the copy, the user's entire database is gone. The picked file survives in the cache directory, but the user has no way to know that, and cache may be purged. This is the single worst failure mode in the app — it hits during the one operation a user performs when they are already worried about their data.

## Current state

- `lib/db/backup.ts:66-75` — the bug:
  ```ts
  export function commitImport(picked: PickedBackup): void {
    const src = new File(picked.uri);
    if (!src.exists) {
      throw new Error("Picked file no longer exists in cache.");
    }
    const dest = getDbFile();
    if (dest.exists) dest.delete();   // ← live DB destroyed here
    deleteDbSidecars();
    src.copy(dest);                   // ← crash before this = total data loss
  }
  ```
- `lib/db/files.ts` — helpers: `getDbFile()` returns `new File(Paths.document, "SQLite", DB_NAME)`; `deleteDbSidecars()` removes `-wal`/`-shm` (required when replacing the main file — see the comment at `files.ts:22-25`); `isSqliteBytes()` magic-header check (already enforced at pick time in `pickBackupFile`, `backup.ts:56-58`).
- Callers: `app/export.tsx:65` (local file import flow) and `hooks/use-cloud-backup.ts:128` (cloud restore). Both call `commitImport(picked)` after a preview/inspection step and run `initDB()` afterwards (see the contract comment at `backup.ts:62-65`). The function signature must not change.
- File API: `expo-file-system` v2 class API (`File`, `Paths`) — see imports at `backup.ts:3` and `files.ts:5`. `File` instances support `.copy(dest)`, `.delete()`, `.move(destination)`, `.exists`. Verify `.move` exists in the installed version (`node_modules/expo-file-system/build` typings) before relying on it.
- Conventions: comments explain *why* (see the existing comment style in `backup.ts:37-40`); no `any`; **never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | all pass (only if plan 001 already landed) |

## Scope

**In scope**:
- `lib/db/backup.ts` (rewrite `commitImport`)
- `lib/db/files.ts` (only if a small helper is needed there)

**Out of scope** (do NOT touch):
- `pickBackupFile`, `exportDatabase` — unrelated to the bug.
- `app/export.tsx`, `hooks/use-cloud-backup.ts`, `lib/db/inspect.ts` — the caller contract (inspect → commitImport → initDB) stays as is.
- `lib/cloud-backup/*` — gdrive/icloud upload/download paths don't replace the live DB directly.

## Git workflow

- Branch: `advisor/002-atomic-backup-import`
- Commit style: `fix: stage backup import to temp file so a crash can't destroy the live db`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stage the incoming DB next to the live one before touching anything

Rewrite `commitImport` to this shape:

```ts
export function commitImport(picked: PickedBackup): void {
  const src = new File(picked.uri);
  if (!src.exists) {
    throw new Error("Picked file no longer exists in cache.");
  }
  const dest = getDbFile();
  // Stage the replacement in the same directory first. The live DB is only
  // touched after the new bytes are fully on disk, so a crash mid-import
  // leaves either the old DB or the staged file — never neither.
  const staged = new File(Paths.document, SQLITE_SUBDIR, `${DB_NAME}.import-staged`);
  if (staged.exists) staged.delete();
  src.copy(staged);
  // Point of no return: clear stale WAL/SHM (they belong to the old DB) and
  // swap. delete+move is two syscalls, but the replacement already exists on
  // the same volume, so the worst crash outcome is "DB missing but staged
  // file present", which step 2's recovery sweep repairs on next launch.
  deleteDbSidecars();
  if (dest.exists) dest.delete();
  staged.move(dest);
}
```

Notes: `SQLITE_SUBDIR` and `DB_NAME` currently live in `lib/db/files.ts` / `lib/constants.ts` — export or import what you need rather than re-hardcoding `"SQLite"`. If `File.move` doesn't exist in the installed expo-file-system version, use `staged.copy(dest); staged.delete();` and say so in your report (slightly weaker, still strictly better than today).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 2: Add a startup recovery sweep for an orphaned staged file

In `lib/db/files.ts`, add and export:

```ts
// If a previous import crashed between deleting the old DB and moving the
// staged file into place, finish (or clean up) the swap before the
// connection opens.
export function recoverStagedImport(): void
```

Behavior: if `<DB_NAME>.import-staged` exists and the main DB file does **not** exist → move staged into place (and delete sidecars). If both exist → the import never reached the swap; delete the staged file. Call `recoverStagedImport()` at the top of `initDB()` in `lib/db/index.ts:90` **before** any connection use — read the first ~30 lines of `initDB` first to confirm where the connection is first touched; if the drizzle connection in `lib/db/connection.ts` opens at module import time (not inside `initDB`), put the call at the top of `connection.ts` before the open instead, and report this.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Manual verification script for the operator

Add to your report (not to the repo) the manual test for the operator: run the app in the simulator, import a backup from `app/export.tsx` flow, confirm data appears; then verify the staged file is absent afterwards (no `.import-staged` left in the SQLite dir).

**Verify**: operator confirms import works end-to-end on simulator.

## Test plan

If plan 001 has landed, add unit tests only for any pure logic you extract (e.g. the recovery decision function: `(stagedExists, dbExists) → action`). The file operations themselves are not unit-testable under node; the operator's simulator run in step 3 is the integration gate.

## Done criteria

- [ ] `commitImport` never deletes the live DB before the staged copy fully exists (code-review check on the diff)
- [ ] `grep -n "dest.delete" lib/db/backup.ts` shows the delete occurs only after `src.copy(staged)`
- [ ] Recovery sweep exists and runs before the first DB connection use
- [ ] `pnpm typecheck` and `pnpm lint` exit 0
- [ ] Operator confirmed simulator import works
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The installed `expo-file-system` `File` class lacks both `.move` and a same-directory atomic rename — report what's available.
- `lib/db/connection.ts` opens the SQLite connection at module-import time AND there is no safe place to run the recovery sweep before it (report the import graph; the maintainer may need to reorder initialization).
- The live code at `backup.ts:66-75` no longer matches the excerpt above.

## Maintenance notes

- If a cloud-restore path is ever added that writes the DB file directly (bypassing `commitImport`), it must use the same staged-swap helper — consider centralizing in `files.ts` then.
- Reviewer should scrutinize: ordering of `deleteDbSidecars()` relative to the swap (stale WAL frames against the new DB corrupt it — see `files.ts:22-25` comment), and that `initDB()` still runs after import in both callers.
- Deferred: a periodic automatic safety snapshot before import (copy live DB to cache with timestamp) — cheap extra belt-and-braces, not required for correctness here.

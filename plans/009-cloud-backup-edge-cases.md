# Plan 009: Fix silent error swallowing in Drive backup lookup and reuse the stored file id on upload

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- lib/cloud-backup/gdrive.ts lib/cloud-backup/index.ts`
> If either file changed since planning, re-read it and reconcile line
> numbers before proceeding; if a cited function body differs materially
> from the excerpt below, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

Two small, independently-verified issues in the Google Drive half of the cloud-backup layer:

1. **`getLatestDriveBackup()` swallows transient HTTP failures as "no backup exists."** Every other Drive-calling function in `gdrive.ts` (`findExistingBackup`, `uploadMultipart`, `downloadBackupFromDrive`) throws on a non-scope `!res.ok` response — a network blip, a Drive 500, or a 429 rate-limit surfaces as a real `Error` the caller can distinguish from "genuinely no backup." `getLatestDriveBackup()` is the one outlier: on any non-scope failure it does `return null`, identical to its true "no backup found" return value. Both of its callers in `lib/cloud-backup/index.ts` treat `null` as "no backup" — most visibly `restoreFromCloud()`, which does `if (!latest) throw new Error("No backup found in Google Drive")`. A user restoring onto a fresh install (the primary real-world use of this code path — `CLOUD_BACKUP_LAST_AT` is per-device config, so `hasEverBackedUp` is false right after a reinstall too, per `hooks/use-cloud-backup-ui.ts:90`) who hits a transient Drive error gets told their backup doesn't exist, when it does.
2. **`CONFIG_KEYS.CLOUD_BACKUP_LAST_FILE_ID` is written but never read.** `backupNow()` stores the Drive file id after every successful upload, but nothing ever reads it back — `grep -rn "CLOUD_BACKUP_LAST_FILE_ID"` across the repo shows exactly two hits: the constant's definition (`lib/constants.ts:294`) and this write (`lib/cloud-backup/index.ts:121`). `uploadBackupToDrive()` always re-derives the file id via a fresh `files.list` request (`findExistingBackup()`) before every upload, so every single backup after the first pays for a Drive round trip whose answer was already sitting in local config.

These are separate from, and not overlapping with, the three delete-before-write bugs (`commitImport()`, `writeDbBytes()`, `uploadBackupToICloud()`) and the duplicated-swap-logic finding fixed in PR #33 (commit `f5a9dc9`) via `lib/db/files.ts`'s `stageFile()`/`commitStagedFile()`/`discardStagedFile()`. That PR's own commit message says so explicitly: *"gdrive.ts's uploadBackupToDrive() uses the Drive HTTP API directly (no local delete+write), so it doesn't share this bug."* Confirmed by re-reading `lib/cloud-backup/gdrive.ts` and `lib/cloud-backup/index.ts` in full — neither finding below touches local-file staging/swap logic at all; both are re-verified as still open.

## Current state

- `lib/cloud-backup/gdrive.ts:55-72` — `findExistingBackup`, a sibling that throws correctly:
  ```ts
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
    throw new Error(`Drive list failed: ${res.status} ${text}`);
  }
  ```
- `lib/cloud-backup/gdrive.ts:134-158` — `getLatestDriveBackup`, the outlier (bug 1), in full:
  ```ts
  export async function getLatestDriveBackup(): Promise<DriveBackupFile | null> {
    const token = await getToken();
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("fields", "files(id,name,modifiedTime,size)");
    url.searchParams.set("q", `name='${BACKUP_FILENAME}' and trashed=false`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("orderBy", "modifiedTime desc");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
      return null;                                          // ← line 149, the bug
    }
    const data = (await res.json()) as { files?: DriveBackupFile[] };
    const file = data.files?.[0];
    if (!file) return null;                                 // ← genuine "no backup" case — correct, leave alone
    return {
      ...file,
      size: typeof file.size === "string" ? Number(file.size) : (file.size ?? 0),
    };
  }
  ```
- `lib/cloud-backup/gdrive.ts:77-123` — `uploadMultipart`, the function that will need a stale-file-id fallback for bug 2:
  ```ts
  async function uploadMultipart(
    token: string,
    body: ArrayBuffer,
    existingId: string | null,
  ): Promise<string> {
    ...
    const url = existingId
      ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existingId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: merged,
    });
    if (!res.ok) {
      const text = await res.text();
      if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
      throw new Error(`Drive upload failed: ${res.status} ${text}`);   // ← line 119
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  }
  ```
- `lib/cloud-backup/gdrive.ts:125-132` — `uploadBackupToDrive`, always re-derives the id (bug 2):
  ```ts
  export async function uploadBackupToDrive(
    body: ArrayBuffer,
  ): Promise<{ fileId: string; modifiedTime: string }> {
    const token = await getToken();
    const existingId = await findExistingBackup(token);   // ← files.list call, every time
    const fileId = await uploadMultipart(token, body, existingId);
    return { fileId, modifiedTime: new Date().toISOString() };
  }
  ```
- `lib/cloud-backup/index.ts:99-128` — `backupNow`, where `fileId` is stored after upload but the id passed to `uploadBackupToDrive` is never sourced from config:
  ```ts
  } else if (provider === "gdrive") {
    const r = await uploadBackupToDrive(bytes);
    modifiedTime = r.modifiedTime;
    fileId = r.fileId;
  } else {
    throw new Error("Cloud backup not supported on this platform");
  }

  await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_AT, modifiedTime);
  if (fileId) {
    await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_FILE_ID, fileId);   // ← line 121, write with no matching read
  }
  ```
  `getConfig`/`updateConfig` are already imported at the top of this file (`lib/cloud-backup/index.ts:10`) — no new import needed for the fix.
- `lib/cloud-backup/index.ts:143-156` — `restoreFromCloud`, the consumer that turns bug 1 into a wrong user-facing message:
  ```ts
  } else if (provider === "gdrive") {
    const latest = await getLatestDriveBackup();
    if (!latest) throw new Error("No backup found in Google Drive");   // ← fires on transient errors too, today
    bytes = await downloadBackupFromDrive(latest.id);
  }
  ```
  No code change is needed here — once `getLatestDriveBackup()` throws its own descriptive error on real HTTP failures, this line only fires for the genuine "no backup" case, which is exactly what it's meant to guard. Re-read it in Step 1's verification to confirm that stays true.
- `hooks/use-cloud-backup-ui.ts:89-96` — the UI-level guard that makes bug 1's real-world impact concrete (checked, not changed by this plan):
  ```ts
  function handleRestore() {
    if (!latest && !hasEverBackedUp) {
      showErrorToast("No backup found", `Nothing to restore from ${providerLabel} yet.`);
      return;
    }
  ```
  `hasEverBackedUp` comes from local `CLOUD_BACKUP_LAST_AT` config (per-device), so it's `false` right after a reinstall — the exact moment a transient Drive error would otherwise be misreported as "no backup."
- `grep -rn "CLOUD_BACKUP_LAST_FILE_ID"` (repo-wide, confirms bug 2): only `lib/constants.ts:294` (definition) and `lib/cloud-backup/index.ts:121` (write) — zero reads.
- Repo has no test runner (`package.json` defines no `test` script, and there are no `*.test.ts` files anywhere in the repo) — verification below is typecheck/lint plus manual, same as the other plans in this batch.
- Repo conventions in play: no `any` types; comments explain why, not what; **never run pnpm commands yourself — tell the operator which command to run and wait.**

## Commands you will need

| Purpose         | Command          | Expected on success |
|------------------|------------------|----------------------|
| Typecheck        | `pnpm typecheck` | exit 0               |
| Lint             | `pnpm lint`      | exit 0               |
| Full quality gate| `pnpm quality`   | exit 0               |

## Scope

**In scope**:
- `lib/cloud-backup/gdrive.ts` (`getLatestDriveBackup`, `uploadMultipart`, `uploadBackupToDrive` only)
- `lib/cloud-backup/index.ts` (`backupNow` only — passing the stored file id through)

**Out of scope** (do NOT touch):
- `lib/cloud-backup/icloud.ts` — no Drive-specific bug applies; iCloud has no file-id/list-then-upload semantics.
- `writeDbBytes()` / `commitImport()` / `uploadBackupToICloud()` and `lib/db/files.ts`'s stage/commit/discard helpers — already fixed in PR #33, not part of this finding.
- `restoreFromCloud()`'s error message text or control flow — no change needed; it self-corrects once `getLatestDriveBackup()` throws correctly (verify, don't edit).
- `hooks/use-cloud-backup.ts` / `hooks/use-cloud-backup-ui.ts` — no change needed; TanStack Query already treats a thrown error differently from a resolved `null`, and the UI's existing `DriveScopeMissingError`/generic-error handling in `reportBackupError` covers the new throw path without modification.
- Adding a project-wide test runner — out of scope; none exists today.

## Git workflow

- Branch: `fix/009-cloud-backup-edge-cases`
- Commit message style: `fix(cloud-backup): throw on transient Drive list failures; reuse stored file id on upload`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `getLatestDriveBackup()` throw on non-scope HTTP failures, matching its siblings

In `lib/cloud-backup/gdrive.ts`, change the `!res.ok` branch inside `getLatestDriveBackup` (around line 146-150) from:

```ts
if (!res.ok) {
  const text = await res.text();
  if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
  return null;
}
```

to:

```ts
if (!res.ok) {
  const text = await res.text();
  if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
  throw new Error(`Drive list failed: ${res.status} ${text}`);
}
```

This is the exact message format `findExistingBackup` already uses one function up, so logs/error messages read consistently across the file. Leave the second `return null` (a few lines down, when `data.files` comes back empty) untouched — that one is the genuine "no backup exists" case and must keep returning `null`.

Then re-read `restoreFromCloud()` (`lib/cloud-backup/index.ts:148-151`) and `getLatestBackup()` (`lib/cloud-backup/index.ts:136-139`) to confirm neither needs a code change: both already just `await` the call and treat a thrown error as a rejected promise (propagating to the TanStack Query mutation/query that calls them), while only a resolved `null` means "no backup." No edit — this is a read-only confirmation.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n "return null" lib/cloud-backup/gdrive.ts` → exactly one match, inside `getLatestDriveBackup`'s empty-files branch (the `findExistingBackup`/`uploadMultipart`/`downloadBackupFromDrive` functions have none).

### Step 2: Add a distinguishable "stale file id" error and a known-id fast path to the upload functions

In `lib/cloud-backup/gdrive.ts`, add a new error class near `DriveScopeMissingError` (after its definition, around line 26):

```ts
// Thrown when a PATCH against a previously-known file id 404s — the file
// was deleted from Drive (manually, or by clearing appDataFolder) since we
// last recorded its id. Caller falls back to a fresh lookup instead of
// failing the backup outright.
class DriveFileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`Drive file ${fileId} no longer exists`);
    this.name = "DriveFileNotFoundError";
  }
}
```

In `uploadMultipart`'s `!res.ok` branch (around line 116-120), add a 404 case before the generic throw:

```ts
if (!res.ok) {
  const text = await res.text();
  if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
  if (existingId && res.status === 404) {
    throw new DriveFileNotFoundError(existingId);
  }
  throw new Error(`Drive upload failed: ${res.status} ${text}`);
}
```

Then change `uploadBackupToDrive` (lines 125-132) to accept an optional known file id and try it first, falling back to the existing `findExistingBackup` lookup only when there's no known id or the known id turned out stale:

```ts
export async function uploadBackupToDrive(
  body: ArrayBuffer,
  knownFileId?: string | null,
): Promise<{ fileId: string; modifiedTime: string }> {
  const token = await getToken();
  if (knownFileId) {
    try {
      const fileId = await uploadMultipart(token, body, knownFileId);
      return { fileId, modifiedTime: new Date().toISOString() };
    } catch (err) {
      if (!(err instanceof DriveFileNotFoundError)) throw err;
      // Stored id is stale — fall through to a fresh lookup below.
    }
  }
  const existingId = await findExistingBackup(token);
  const fileId = await uploadMultipart(token, body, existingId);
  return { fileId, modifiedTime: new Date().toISOString() };
}
```

Do not export `DriveFileNotFoundError` — it's fully handled inside this module; nothing outside `gdrive.ts` needs to catch it.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Pass the stored file id from `backupNow()`

In `lib/cloud-backup/index.ts`, inside `backupNow()` (around line 111-114), change:

```ts
} else if (provider === "gdrive") {
  const r = await uploadBackupToDrive(bytes);
  modifiedTime = r.modifiedTime;
  fileId = r.fileId;
}
```

to:

```ts
} else if (provider === "gdrive") {
  const knownFileId = await getConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_FILE_ID);
  const r = await uploadBackupToDrive(bytes, knownFileId);
  modifiedTime = r.modifiedTime;
  fileId = r.fileId;
}
```

`getConfig` is already imported at the top of this file — no import changes needed. On a first-ever backup (or a reinstall where local config was wiped but a Drive backup from a previous install still exists), `getConfig` returns `null`, `uploadBackupToDrive` skips the known-id fast path, and falls straight through to `findExistingBackup` — identical behavior to today, so the existing dedup-on-reinstall case is preserved.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `pnpm quality` → exit 0; re-read `uploadBackupToDrive`, `uploadMultipart`, and `backupNow` together and confirm `knownFileId` threads end to end and the 404 fallback path is reachable (no dead branch).

## Test plan

No automated tests cover this path. Manual verification (operator-run, requires a signed-in Google account with Drive backup already enabled — the executor should describe these steps in the final report but not attempt them without operator confirmation, since they need `pnpm android` and a real network):

- **Step 1 (transient-error handling)**: Hardest to trigger organically (needs an actual Drive 5xx/429 or a network blip mid-request). Acceptable substitute: temporarily point the `DRIVE_API` constant at an unreachable host, trigger a restore, confirm the toast shows a generic/network-style error (not "No backup found"), then revert the constant. Do this only as a local, uncommitted, throwaway edit — never commit it.
- **Step 2 + 3 (file id reuse)**: With cloud backup already enabled and at least one prior backup made, trigger a second manual backup (Settings → Backup Now) and confirm it still succeeds and the "Last backed up" timestamp updates. There's no cheap way to observe the skipped `files.list` call without a network proxy/logging; if the operator wants to confirm the round-trip is actually skipped, a temporary `console.log` in `uploadBackupToDrive` (removed before committing) showing whether the known-id branch or the fallback branch ran is the simplest check.

## Done criteria

- [ ] `getLatestDriveBackup()` throws on non-scope `!res.ok` responses; only returns `null` when `data.files` is genuinely empty
- [ ] `uploadBackupToDrive()` accepts an optional `knownFileId`, tries it via PATCH first, and falls back to `findExistingBackup()` on a 404 or when no id was supplied
- [ ] `backupNow()` reads `CONFIG_KEYS.CLOUD_BACKUP_LAST_FILE_ID` via `getConfig` and passes it into `uploadBackupToDrive()`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality` all exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getLatestDriveBackup`, `uploadMultipart`, or `uploadBackupToDrive` no longer match the excerpts above (re-read the file and reconcile per the drift check).
- The Drive API returns a status other than 404 for a PATCH against a deleted/missing file id (re-verify against Drive API docs or an actual response before assuming the fallback triggers correctly) — if it's e.g. a 400 instead, adjust the `res.status === 404` check accordingly and note the change in your report.
- `restoreFromCloud()` or `getLatestBackup()` turn out to already have their own try/catch around `getLatestDriveBackup()` that would swallow the new throw (they don't, per the excerpts above, but re-check if the drift check shows the file changed).

## Maintenance notes

- If Drive ever starts returning a different status for "file not found" (e.g. via an API version bump), update the check in `uploadMultipart`'s `!res.ok` branch — the fallback logic in `uploadBackupToDrive` doesn't need to change, only what counts as "stale id."
- The same "store the id, try it first, fall back on 404" pattern would apply to any future provider that has an update-by-id API; iCloud's path-based `uploadBackupToICloud()` has no equivalent id to cache, so this pattern is Drive-specific by design, not an oversight.

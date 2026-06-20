# Plan 007: Untrack Firebase config files (google-services.json, GoogleService-Info.plist) and document local restore

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git ls-files | grep -iE "google-services|GoogleService"`
> Expected: `GoogleService-Info.plist`, `google-services.json`,
> `google-services.json.example`. If the real files are already untracked,
> mark this plan DONE-by-drift and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED (build breakage on fresh clones if docs are skipped)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

The real `google-services.json` and `GoogleService-Info.plist` are committed, while a `google-services.json.example` exists — strong evidence the real ones were meant to stay local. Firebase *client* config is semi-public by design (it ships inside the app binary), so this is low severity — but if this repo is or ever becomes public, the committed files hand out the project's identifiers and API key in a trivially greppable place, and they'll live in git history forever. Untracking now keeps the repo shareable; the operator can optionally add API-key restrictions in Google Cloud as belt-and-braces.

**Important honesty note for the operator**: untracking does NOT remove the files from git history. If the repo is public today, treat the values as already public (which, for Firebase client config, is usually acceptable when Firebase security rules don't trust the client — this app stores data locally/in its own Postgres, not Firestore).

## Current state

- `git ls-files` shows tracked: `google-services.json`, `GoogleService-Info.plist`, `google-services.json.example`.
- `.gitignore` does NOT list either real file (it ignores `credentials.json`, `credentials/`, `*.jks`, `.env*.local`, etc.).
- Firebase usage: `@react-native-firebase/{app,analytics,crashlytics,perf}` in `package.json`; the config files are consumed at build time. Check `app.json` for `"googleServicesFile"` entries (both Android and iOS) — Expo prebuild reads the paths from there; the files must exist locally for `expo prebuild` / EAS builds.
- `docs/CI.md` covers EAS builds and secrets — read its secrets section before editing; EAS supports uploading these files as secrets/files for cloud builds.
- Repo conventions: **never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Untrack   | `git rm --cached google-services.json GoogleService-Info.plist` | files leave the index, stay on disk |
| Lint      | `pnpm lint`      | exit 0              |

## Scope

**In scope**:
- `.gitignore`
- git index only for `google-services.json`, `GoogleService-Info.plist` (files stay on disk)
- `GoogleService-Info.plist.example` (create, with placeholder values)
- `README.md` setup section + `docs/CI.md` (document restoring the files)

**Out of scope** (do NOT touch):
- The contents of the real config files.
- History rewriting (`filter-repo`/BFG) — operator decision only; mention in report.
- `app.json`, `eas.json` — the file paths they reference remain valid because the files stay on disk.
- Key rotation — list it as an operator option in the report, with the caveat that rotating a Firebase client key requires updating both config files and rebuilding.

## Git workflow

- Branch: `advisor/007-untrack-firebase-config`
- Commit style: `chore: untrack firebase config files; add plist example and restore docs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Untrack and ignore

Run `git rm --cached google-services.json GoogleService-Info.plist` (note: `--cached` keeps the working-tree files). Add both filenames to `.gitignore` under the existing "eas credentials" section.

**Verify**: `git ls-files | grep -iE "google-services.json$|GoogleService-Info.plist$"` → no output; `ls google-services.json GoogleService-Info.plist` → both still present on disk.

### Step 2: Create the plist example

Create `GoogleService-Info.plist.example` mirroring the real plist's keys with placeholder values (`YOUR_API_KEY`, `YOUR_GCM_SENDER_ID`, etc.). Copy the key *names* from the real file; never copy real values. Model the placeholder style on the existing `google-services.json.example`.

**Verify**: `grep -c "YOUR_" GoogleService-Info.plist.example` → ≥3; `grep "AIza" GoogleService-Info.plist.example` → no output.

### Step 3: Document restoration

In `README.md` setup section, add: copy both `.example` files to their real names and fill values from the Firebase console (Project settings → your apps), or pull them from EAS file secrets. In `docs/CI.md`, confirm/extend the secrets section so EAS builds keep working — if CI currently relies on the committed files, note the required EAS secret upload step explicitly.

**Verify**: `pnpm lint` → exit 0 (biome formats md? if biome ignores md, visual check).

### Step 4: Operator follow-ups (report only)

Report to the operator: (a) optional Google Cloud API-key restrictions (restrict the Firebase key to the Firebase services in use + app identifiers); (b) optional history rewrite if the repo is public and they care; (c) they must verify their next EAS build still finds the config files.

## Test plan

No code paths change. The gate is: operator's next `expo prebuild` or EAS build succeeds with the local/untracked files.

## Done criteria

- [ ] Both real config files untracked, on disk, and gitignored
- [ ] `GoogleService-Info.plist.example` exists with placeholders only
- [ ] README + docs/CI.md document restoration
- [ ] No real credential value appears in any tracked file added by this plan
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `app.json` references the config files via paths that imply they're consumed from the repo by CI in a way docs don't cover (e.g. a GitHub Action checks out and prebuilds without EAS secrets) — report the workflow file and line.
- The real plist contains keys beyond standard Firebase client config (anything that looks like a server key or OAuth client secret) — report file + credential type only.

## Maintenance notes

- Fresh-clone setup now has one more manual step; if it trips people, an EAS "file env" pull script is the fix, not re-committing.
- If the operator later rotates the Firebase key, both local files and EAS secrets need the update before the next build.

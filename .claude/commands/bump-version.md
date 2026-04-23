---
allowed-tools: Read, Edit, Bash(git diff:*), Bash(git status:*)
argument-hint: [next-version] (optional, e.g. 0.7.0)
description: bump app version across package.json, app.json, lib/version.ts and increment build numbers
---

## context

- current app.json: !`grep -E '"version"|"buildNumber"|"versionCode"' app.json`
- current package.json version: !`grep -E '"version"' package.json | head -1`
- current lib/version.ts: !`grep -E 'APP_VERSION' lib/version.ts`
- releasing checklist: @RELEASING.md
- argument: $ARGUMENTS

## task

Bump the app version across all five fields listed in `RELEASING.md`. Do NOT commit.

### step 1 — determine target version

- If `$ARGUMENTS` is empty, print the current semver (from `lib/version.ts`) and the current `buildNumber` / `versionCode`, then ask the user what the next version should be. Stop and wait for their reply.
- If `$ARGUMENTS` looks like a version (or the user has replied with one), use it as the target.
- Validate it matches `^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$`. If invalid, stop and tell the user.
- Derive `strippedTarget` by removing any `-prerelease` tag. This is what goes into `app.json` and `lib/version.ts` (Expo rejects the suffix, and `compareVersions()` only handles `major.minor.patch`).

### step 2 — read the current build numbers

From `app.json`, find:
- `expo.ios.buildNumber` (a quoted integer string)
- `expo.android.versionCode` (an unquoted integer)

If either can't be found, stop — don't guess.

### step 3 — update all five fields in one pass

Use Edit, not Write, on each file. Match exact strings.

1. `package.json` — `version` → full target (keep prerelease if present)
2. `app.json` — `expo.version` → `strippedTarget`
3. `app.json` — `expo.ios.buildNumber` → current + 1, string-quoted
4. `app.json` — `expo.android.versionCode` → current + 1, unquoted integer
5. `lib/version.ts` — `APP_VERSION` → `strippedTarget`

### step 4 — summarise and stop

Print a one-block summary:

```
version:      0.6.0 → 0.7.0
buildNumber:  7 → 8
versionCode:  7 → 8
```

Do not run `git add` or `git commit`. The user will review the diff and commit themselves.

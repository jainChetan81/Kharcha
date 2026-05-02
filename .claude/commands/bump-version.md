---
allowed-tools: Read, Edit, Bash(git diff:*), Bash(git status:*)
argument-hint: [next-version] (optional, e.g. 0.7.0)
description: bump app version across package.json, app.json and increment build numbers
---

## context

- current app.json: !`grep -E '"version"|"buildNumber"|"versionCode"' app.json`
- current package.json version: !`grep -E '"version"' package.json | head -1`
- argument: $ARGUMENTS

## checklist

Four fields must change together (full reasoning in `docs/RELEASE.md` → "version bump checklist"):

| File | Field | Update |
| --- | --- | --- |
| `package.json` | `version` | full target (may include prerelease tag, e.g. `0.6.1-beta.1`) |
| `app.json` | `expo.version` | stripped target (no prerelease suffix — Expo rejects it) |
| `app.json` | `expo.ios.buildNumber` | current + 1, string-quoted |
| `app.json` | `expo.android.versionCode` | current + 1, unquoted integer |

EAS does not auto-increment build numbers in this project — bump them yourself.

## task

Bump the app version across all four fields above. Do NOT commit.

### step 1 — determine target version

- If `$ARGUMENTS` is empty, print the current semver (from `package.json`) and the current `buildNumber` / `versionCode`, then ask the user what the next version should be. Stop and wait for their reply.
- If `$ARGUMENTS` looks like a version (or the user has replied with one), use it as the target.
- Validate it matches `^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$`. If invalid, stop and tell the user.
- Derive `strippedTarget` by removing any `-prerelease` tag. This is what goes into `app.json` (Expo rejects the suffix).

### step 2 — read the current build numbers

From `app.json`, find:
- `expo.ios.buildNumber` (a quoted integer string)
- `expo.android.versionCode` (an unquoted integer)

If either can't be found, stop — don't guess.

### step 3 — update all four fields in one pass

Use Edit, not Write, on each file. Match exact strings.

1. `package.json` — `version` → full target (keep prerelease if present)
2. `app.json` — `expo.version` → `strippedTarget`
3. `app.json` — `expo.ios.buildNumber` → current + 1, string-quoted
4. `app.json` — `expo.android.versionCode` → current + 1, unquoted integer

### step 4 — summarise and stop

Print a one-block summary:

```
version:      0.6.0 → 0.7.0
buildNumber:  7 → 8
versionCode:  7 → 8
```

Do not run `git add` or `git commit`. The user will review the diff and commit themselves.

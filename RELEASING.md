# Releasing

## Version bump checklist

When bumping versions (e.g. `0.6.0` → `0.6.1`), update **all five** in the same commit:

| File | Field | Example |
|---|---|---|
| `package.json` | `version` | `"0.6.1"` |
| `app.json` | `expo.version` | `"0.6.1"` |
| `app.json` | `expo.ios.buildNumber` | `"7"` (increment) |
| `app.json` | `expo.android.versionCode` | `7` (increment) |
| `lib/version.ts` | `APP_VERSION` | `"0.6.1"` |

### Why each matters

- **`version` (three places)** — user-facing semver. Must match across `package.json`, `app.json`, and `lib/version.ts` (the last drives in-app migration comparisons via `compareVersions()`).
- **`buildNumber` (iOS)** — App Store Connect rejects a submission where both `version` and `buildNumber` match a prior upload. Increment on every submission, even if `version` didn't change.
- **`versionCode` (Android)** — Google Play requires this to strictly increase with each release. Increment by 1 each time.

`buildNumber` and `versionCode` should stay aligned when practical — makes cross-platform triage easier.

### Prerelease tags

`package.json` may carry a prerelease tag (`0.6.1-beta.1`). `app.json` and `lib/version.ts` must not — Expo rejects the suffix, and `compareVersions()` only handles `major.minor.patch`.

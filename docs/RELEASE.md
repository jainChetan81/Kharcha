# release guide

kharcha ships via two mechanisms:

1. **EAS Build** — produces a native binary (`.aab` / `.ipa`). Required when native code, plugins, or `app.json` native config changes.
2. **EAS Update (OTA)** — ships JS + asset changes to already-installed builds. No store review, instant rollout.

Runtime version policy is `fingerprint` ([app.json](app.json)): the runtime is a hash of the project's **native** layer — native deps, config plugins, `app.json` native fields, and custom native modules under `modules/` — computed by [`@expo/fingerprint`](https://docs.expo.dev/versions/latest/sdk/fingerprint/). An OTA update only reaches builds whose fingerprint matches, so the runtime changes exactly when a new native build is needed and never on a plain version bump. Marketing `version` / `buildNumber` / `versionCode` are excluded from the hash via [fingerprint.config.js](../fingerprint.config.js) (`sourceSkips: ['ExpoConfigVersions']`), so bumping them never breaks OTA continuity. Whenever you ship a native build, follow the [version bump checklist](#version-bump-checklist) at the bottom of this doc.

> Migrated from the `appVersion` policy (which minted a new runtime on every version bump, so OTA updates were version-locked and couldn't span releases). Builds made under the old policy have runtimes like `0.5.1`; they won't receive fingerprint-runtime updates — but with no OTA users at migration time there's nothing to carry over.

---

## production build (local, android)

Builds an `.aab` on your machine without burning EAS cloud credits.

```bash
pnpm build:android:local
# = eas build --platform android --profile production --local
```

Requirements: Android SDK, JDK 17, Gradle cache. First run is slow (~15 min); subsequent runs faster. EAS writes the artifact to the current working directory as `build-<uuid>.aab`.

Then upload manually to Play Console → Production → Create new release → upload the `.aab`.

### cloud build (fallback)

If local tooling is broken:

```bash
pnpm build:android           # production profile, cloud
pnpm build:android:preview   # preview profile, cloud, apk
```

---

## OTA update (JS-only changes)

For any change that does **not** touch native code (no new native deps, no `app.json` native fields, no plugin changes):

```bash
pnpm update:production   # = eas update --branch production --auto
pnpm update:preview      # preview channel
```

`--auto` uses the current git branch name as the update branch and the latest commit message as the update message. To set them explicitly:

```bash
eas update --branch production --message "fix: parser retry"
```

The channel → branch mapping is defined in [eas.json](eas.json):

- `production` profile → `production` channel
- `preview` profile → `preview` channel
- `development` profile → `development` channel

Installed prod builds poll `https://u.expo.dev/a5f4eef2-...` ([app.json](app.json)) and pull the latest update matching their runtime version.

---

## when to rebuild vs OTA

| change                                          | rebuild? | OTA?   |
| ----------------------------------------------- | -------- | ------ |
| JS logic, components, styles                     | ❌       | ✅     |
| New JS-only dep                                  | ❌       | ✅     |
| New native dep or expo plugin                    | ✅       | ❌     |
| Native code under `modules/`                     | ✅       | ❌     |
| `app.json` native fields (permissions, plugins)  | ✅       | ❌     |
| Icons / splash screen                            | ✅       | ❌     |
| `app.json` → `version` / `buildNumber` / `versionCode` bump | ❌\* | ✅ |

\* Excluded from the fingerprint via [fingerprint.config.js](../fingerprint.config.js), so a version bump alone does **not** change the runtime — existing builds keep receiving OTA updates. You still rebuild + bump for store submissions, but OTA continuity is preserved across the bump.

Rule of thumb: if the **fingerprint** changes, rebuild. Anything that alters the native layer (deps, plugins, `modules/`, native `app.json` fields, bundled assets) changes it; pure-JS changes don't. EAS computes and compares the fingerprint automatically on every build and update.

---

## manual upload flow (play store)

1. `pnpm build:android:local` → produces `.aab`
2. Play Console → **Production** → **Create new release**
3. Upload `.aab`, write release notes, save → review → rollout
4. After rollout, any JS-only hotfix can ship via `pnpm update:production` without another store review

---

## version bump checklist

When bumping versions (e.g. `0.6.0` → `0.6.1`), update **all four** in the same commit:

| File | Field | Example |
| --- | --- | --- |
| `package.json` | `version` | `"0.6.1"` |
| `app.json` | `expo.version` | `"0.6.1"` |
| `app.json` | `expo.ios.buildNumber` | `"7"` (increment) |
| `app.json` | `expo.android.versionCode` | `7` (increment) |

### Why each matters

- **`version` (two places)** — user-facing semver. Must match across `package.json` and `app.json`.
- **`buildNumber` (iOS)** — App Store Connect rejects a submission where both `version` and `buildNumber` match a prior upload. Increment on every submission, even if `version` didn't change.
- **`versionCode` (Android)** — Google Play requires this to strictly increase with each release. Increment by 1 each time.

EAS does **not** auto-increment these in this project ([eas.json](eas.json) has no remote `appVersionSource`) — bump them yourself before each build.

None of these three fields affect the OTA runtime — they're stripped from the fingerprint by [fingerprint.config.js](../fingerprint.config.js). They matter only for the stores and for users reading the version in-app.

`buildNumber` and `versionCode` should stay aligned when practical — makes cross-platform triage easier.

### Prerelease tags

`package.json` may carry a prerelease tag (`0.6.1-beta.1`). `app.json` must not — Expo rejects the suffix.

# release guide

kharcha ships via two mechanisms:

1. **EAS Build** — produces a native binary (`.aab` / `.ipa`). Required when native code, plugins, or `app.json` native config changes.
2. **EAS Update (OTA)** — ships JS + asset changes to already-installed builds. No store review, instant rollout.

Runtime version policy is `appVersion` ([app.json](app.json)), so OTA updates only reach builds with the matching `version` in `app.json`. Bump `version` whenever you ship a native build.

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

| change                                 | rebuild? | OTA?   |
| -------------------------------------- | -------- | ------ |
| JS logic, components, styles           | ❌       | ✅     |
| New JS-only dep                        | ❌       | ✅     |
| New native dep or expo plugin          | ✅       | ❌     |
| `app.json` native fields (permissions) | ✅       | ❌     |
| `app.json` → `version` bump            | ✅       | ❌     |
| Icons / splash screen                  | ✅       | ❌     |

Rule of thumb: if `ios/` or `android/` would regenerate differently, rebuild.

---

## manual upload flow (play store)

1. `pnpm build:android:local` → produces `.aab`
2. Play Console → **Production** → **Create new release**
3. Upload `.aab`, write release notes, save → review → rollout
4. After rollout, any JS-only hotfix can ship via `pnpm update:production` without another store review

---

## version bumping checklist

Before a native release:

1. Bump `"version"` in [app.json](app.json)
2. Bump `"version"` in [package.json](package.json) to match
3. Android `versionCode` auto-increments via EAS; iOS `buildNumber` likewise
4. Commit, then build

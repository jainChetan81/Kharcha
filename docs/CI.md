# CI/CD & Local Development

This guide explains the continuous integration setup, when to use which CI process, and how to run quality checks locally.

## Quick Start

Before pushing code:

```bash
pnpm run local-ci
```

This runs the same checks as GitHub Actions CI locally, catching issues early.

---

## Local CI: `pnpm run local-ci`

### What It Does

Mirrors the GitHub Actions CI pipeline locally in a single command:

```bash
pnpm install --frozen-lockfile
pnpm lint          # biome check
pnpm typecheck     # tsc --noEmit
pnpm run dead-code # dead code detection
pnpm audit         # dependency audit (warning only, runs last)
```

### When to Use

- **Before pushing**: Always run this to avoid CI failures.
- **Local development**: Run after making code changes.
- **Team**: Developers should run this before pushing (lefthook only enforces biome on pre-commit and typecheck on pre-push; `local-ci` itself is manual).

### Why It Works Locally

- Uses the exact same versions from `pnpm-lock.yaml`
- Runs the same tools (biome, tsc, knip) as GitHub Actions
- Catches lint errors, type errors, and dead code before they reach CI
- Uses the `dead-code` script which wraps `knip --no-exit-code`
- Faster feedback loop than waiting for GitHub Actions

### Requirements

- Node >= 22.19.0
- pnpm >= 9.0.0
- Dependencies installed (`pnpm install --frozen-lockfile`)

### Example Output

```
$ pnpm run local-ci
✓ Dependencies installed
✓ Lint check passed (0 errors)
✓ TypeScript check passed
⚠ Audit: 1 moderate vulnerability (non-blocking)
✓ Dead code check: no issues found
```

---

## GitHub Actions CI Workflows

### `.github/workflows/ci.yml` (Push & Pull Request)

**Triggers**: Push to `main`/`master`, Pull Requests

**Jobs**:
1. **install dependencies** → `pnpm install --frozen-lockfile`
2. **lint** → `biome check .`
3. **typecheck** → `tsc --noEmit`
4. **audit** → `pnpm audit --audit-level=high` (warning only)
5. **dead code detection** → `pnpm knip --no-exit-code`

**Status**: Required to pass for PR merge

**Why**: Ensures code quality, type safety, and no dead code before merging

---

### `.github/workflows/android-build.yml` (Manual Trigger)

**Triggers**: Manual via `workflow_dispatch` on `main`

**What It Does**:
1. Installs dependencies
2. Sets up EAS CLI with `EXPO_TOKEN`
3. Builds Android APK via EAS: `eas build --platform android --profile preview --non-interactive`
4. Downloads the APK artifact
5. Creates a GitHub release with the APK attached
6. Stores artifact for 7 days

**When to Use**:
- Release a new Android build
- Manual testing on Android devices
- Public distribution

**Requirements**:
- GitHub secret: `EXPO_TOKEN` (Expo account token)

**Output**:
- GitHub release with downloadable APK
- Direct install on Android devices

---

### `.github/workflows/ios-build.yml` (Manual Trigger)

**Triggers**: Manual via `workflow_dispatch` on `main`

**What It Does**:
1. Installs dependencies
2. Sets up EAS CLI with `EXPO_TOKEN`
3. Builds iOS app via EAS: `eas build --platform ios --profile preview --non-interactive`
4. Submits to TestFlight: `eas submit --platform ios --latest --non-interactive`

**When to Use**:
- Build for iOS TestFlight testing
- Internal testing, beta distribution
- Before App Store release

**Requirements**:
- GitHub secret: `EXPO_TOKEN`
- EAS project linked to Apple account
- Apple Developer account with app bundle ID registered

**Output**:
- iOS build submitted to TestFlight
- Available for beta testers

---

## EAS Build Profiles

The app has three profiles in `eas.json` (`development`, `preview`, `production`):

### `preview` (Current Default)

Used for:
- Development builds
- Manual testing
- Beta distribution

Characteristics:
- Faster builds
- Updates enabled (can push OTA updates)
- Not optimized for App Store

### `production`

Used for:
- App Store / Play Store release builds (`pnpm build:android`, `pnpm build:ios`)
- OTA updates on the `production` channel (`pnpm update:production`)
- Optimized, signed for production
- No development features

---

## Environment Variables

### Required for Local Development

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
# Then fill in your values
```

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `EXPO_TOKEN` | Expo CLI authentication (for builds) | GitHub CI only |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth iOS | Development, iOS build |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth Web | Gmail sync |
| `EXPO_PUBLIC_GEMINI_API_KEY` | On-device Gemini parsing (optional — AI parsing degrades gracefully). `EXPO_PUBLIC_*` is inlined into the client bundle and extractable from the IPA/APK — do not treat this as secret; restrict the key in Google Cloud instead. Direct client calls are for internal/development builds only — a public release must move Gemini calls behind an authed proxy first (see [lib/env.ts](../lib/env.ts)) | AI paste/share parsing |
| `EXPO_DEVTOOLS_LISTEN_ADDRESS` | Metro bundler address | Local development |
| `RCT_METRO_PORT` | Metro bundler port | Local development |

### See Also

- `.env.local` (git-ignored, local machine)
- `.env.example` (template, committed)
- `lib/env.ts` (validates required vars on startup)

---

## Pre-commit Hooks

### Automatic Setup

Running `pnpm install` automatically installs git hooks via `lefthook`:

```bash
pnpm install
# → lefthook install
```

### What Runs Before Commit

- `biome format --write` + `biome check` on staged files (format + lint)

### What Runs Before Push

- `tsc --noEmit` (type check)
- (`react-doctor:diff` is currently disabled — spin-loop bug, see lefthook.yml TODO)

### Skip Hooks (Dev Only)

```bash
git commit --no-verify
```

---

## Development Commands Reference

### Code Quality

```bash
pnpm lint              # biome check (lint errors)
pnpm lint:fix          # biome check --write (format + lint fix)
pnpm typecheck         # tsc --noEmit (type errors)
pnpm quality           # lint + typecheck
pnpm local-ci          # full CI pipeline (before push)
pnpm run dead-code                # knip dead code detection
pnpm audit                        # dependency audit
pnpm run deps:check    # expo dependency compatibility check
```

### Development

```bash
pnpm start                        # expo dev server
pnpm ios                          # run on iOS simulator (requires Mac)
pnpm android                      # run on Android emulator
pnpm web                          # run on web (localhost:19006)
pnpm doctor                       # expo health check
pnpm run deps:check    # expo dependency compatibility check
```

**Note on `pnpm run deps:check`**: Validates that all installed packages are compatible with Expo SDK 55. Run this if you see warnings about mismatched dependencies or if the app won't start. It will recommend package versions to install.

### Database

```bash
pnpm drizzle:studio           # open drizzle studio (browse db)
pnpm drizzle:generate         # generate migration after schema change
```

migrations run automatically on app launch (`initDB()`) — no manual migrate step. see [docs/DRIZZLE.md](DRIZZLE.md).

---

## Running Local CI Step-by-Step

### Setup (One Time)

```bash
git clone <repo>
cd kharcha
pnpm install --frozen-lockfile
```

### Before Each Push

```bash
# Run all checks locally
pnpm run local-ci

# If lint fails, auto-fix
pnpm lint:fix

# Then commit and push
git add .
git commit -m "fix: format issues"
git push
```

### What If Local CI Passes But GitHub CI Fails?

1. **Check Node/pnpm versions** (must match):
   ```bash
   node --version    # >= 22.19.0
   pnpm --version    # >= 9.0.0
   ```

2. **Ensure lockfile is committed**:
   ```bash
   git status pnpm-lock.yaml
   ```

3. **Re-install dependencies**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run local-ci
   ```

4. **Check GitHub Actions logs** (click "Details" on PR check)

---

## Secrets Management

### GitHub Secrets Required

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Value | Used By |
|---|---|---|
| `EXPO_TOKEN` | Your Expo account token | Android & iOS builds |
| `GITHUB_TOKEN` | Auto-generated (default) | Create releases |

### How to Get `EXPO_TOKEN`

1. Create [Expo account](https://expo.dev)
2. Go to **expo.dev → Account Settings → Access Tokens**
3. Create a new token
4. Add to GitHub secrets

### Local Development (No Secrets Needed)

- Run `pnpm run local-ci` without secrets
- Run `pnpm start` without secrets
- Gmail sync requires Google OAuth client IDs (in `.env.local`)

---

## Troubleshooting

### "ERR_PNPM_CI_NOT_IMPLEMENTED"

**Problem**: Running `pnpm ci` fails

**Solution**: Use `pnpm run local-ci` instead (pnpm's built-in `ci` is not customizable)

```bash
pnpm run local-ci  # ✓ Correct
pnpm ci            # ✗ pnpm built-in, not our scripts
```

---

### "Module not found" Errors

**Problem**: TypeScript errors about missing modules

**Solution**: Re-install dependencies
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install --frozen-lockfile
pnpm run local-ci
```

---

### "expo doctor" Warnings

**Problem**: Expo dependency mismatch

**Solution**: Run expo doctor and fix
```bash
pnpm doctor
# Follow recommendations, then:
pnpm run local-ci
```

---

### "audit" Shows Vulnerabilities

**Problem**: `pnpm audit` reports vulnerabilities

**Solution**:
- If moderate/low: not blocking (CI allows via `|| true`)
- If high/critical: run `pnpm audit fix` and commit

```bash
pnpm audit fix
pnpm install --frozen-lockfile
pnpm run local-ci
git add package.json pnpm-lock.yaml
git commit -m "fix: update dependencies for security"
```

---

### Network Errors During Build

**Problem**: "Network timeout" or "Connection refused"

**Solution**:
- Check internet connection
- Retry: `eas build --platform android --profile preview --non-interactive`
- Check EAS status: https://status.expo.io

---

### Build Failed on GitHub Actions but Works Locally

**Problem**: Local `pnpm run local-ci` passes, but GitHub Actions fails

**Solution**:
1. Check GitHub Actions logs for exact error
2. Ensure `pnpm-lock.yaml` is committed
3. Verify Node/pnpm versions in GitHub workflow match local:
   ```bash
   # Check workflow file
   cat .github/workflows/ci.yml | grep -A 2 "node-version"
   ```
4. Push again (sometimes transient server issues)

---

## Contributing Guidelines

### Workflow

1. **Create branch** from `main`
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**, run local checks frequently
   ```bash
   pnpm run local-ci
   ```

3. **Fix any issues** (lint, types, dead code)
   ```bash
   pnpm lint:fix
   pnpm run local-ci
   ```

4. **Commit** (pre-commit hooks run automatically)
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

5. **Push & create PR**
   ```bash
   git push origin feature/my-feature
   ```

6. **GitHub CI runs automatically** ✓

7. **Merge when all checks pass** ✓

---

## Summary: When to Use What

| Scenario | Command | Why |
|---|---|---|
| Before pushing | `pnpm run local-ci` | Catch issues before CI |
| Fix lint errors | `pnpm lint:fix` | Auto-format code |
| Type check only | `pnpm typecheck` | Fast feedback |
| Dead code scan | `pnpm run dead-code` | Find unused code |
| Check dependencies | `pnpm run deps:check` | Verify Expo compatibility |
| Full dev cycle | `pnpm start` | Run app locally |
| Release Android | GitHub UI → android-build.yml | Creates release with APK |
| Release iOS beta | GitHub UI → ios-build.yml | Submits to TestFlight |
| Check health | `pnpm doctor` | Validate expo setup |

---

## Additional Resources

- [Expo Docs](https://docs.expo.dev)
- [EAS Build](https://docs.expo.dev/build/introduction)
- [Biome Docs](https://biomejs.dev)
- [TypeScript](https://www.typescriptlang.org)
- [pnpm Docs](https://pnpm.io)

---

**Last Updated**: April 2, 2026

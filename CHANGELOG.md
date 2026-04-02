# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta] - 2026-04-02

**First beta release** — Local-first expense tracking for iOS with Drizzle ORM migrations.

### Added

- **Drizzle ORM integration** — typed schema management with SQLite migrations
  - `drizzle.config.ts` for schema introspection
  - `drizzle/migrations/` auto-generated SQL migrations
  - `pnpm drizzle:generate` for schema changes
  - `pnpm drizzle:studio` for local database inspection
  - Migration versioning via `drizzle/meta/` tracking

- **App core features**
  - Local-first SQLite storage on Expo
  - Transaction tracking (income/expense)
  - Category & source management with defaults
  - Recurring subscriptions with billing day
  - Per-category budgets with visual indicators
  - Multi-currency support (INR/USD/GBP/EUR)
  - Gmail sync via OAuth (Axis Bank + HDFC parsing)
  - Swipe-to-delete with 5s undo
  - iOS quick actions (long-press app icon)
  - Pull-to-refresh data
  - Dark mode support

- **Developer experience**
  - TypeScript strict mode
  - Biome linting + formatting
  - TanStack Query + Form for data layer
  - Expo Router file-based routing
  - NativeWind v4 + react-native-reusables for UI
  - Comprehensive documentation
  - Local CI script for pre-commit validation
  - Lefthook git hooks

### Technical Stack

- **Frontend**: Expo 55 + React Native + React 19
- **Database**: SQLite + Drizzle ORM
- **State**: TanStack Query (data) + Zustand (UI state)
- **Styling**: NativeWind v4 + Tailwind CSS
- **Validation**: Zod
- **Formatting**: Biome 2.4.9
- **Package Manager**: pnpm 9.0.0

---

## Unreleased

### Planned

- [ ] Offline-first sync architecture
- [ ] Cloud backup & restore
- [ ] Receipt OCR via camera
- [ ] Budget trend analytics
- [ ] Expense forecasting
- [ ] Tax category export
- [ ] Dark mode toggle
- [ ] App lock (biometric)

---

## Migration Guide

### Fresh Install (0.1.0-beta)

On first launch, app will:

1. Run all migrations in `drizzle/migrations/`
2. Create default categories, sources, config
3. Ready to use ✅

No setup needed — database self-initializes.

### Updating During Beta (0.1.x → 0.2.x)

When updating between beta versions:

1. **Pull the new version**
2. **Run `pnpm drizzle:generate`** if schema changed (output shows pending migrations)
3. **Test locally**: `pnpm ios`
4. **Migrations run automatically** on app launch — no manual steps needed

Breaking changes will be noted in each release's changelog.

### Future: Stable Release (0.x → 1.0.0)

When upgrading to new major versions:

1. **Check `docs/DRIZZLE.md`** for schema changes
2. **Run `pnpm drizzle:generate`** to see pending migrations
3. **Test locally** with `pnpm ios` before deployment
4. **Migrations run automatically** on app launch (via `initDB()`)
5. **No manual data migration needed** if migrations are simple schema changes

Breaking changes will be noted in `## Migration Guide` section of each release.

---

## Release Process

### For Maintainers

1. **Update version** in `app.json`, `package.json`, and `lib/version.ts` (**keep them in sync**)

   ```bash
   # Update all three to same version
   app.json: "version": "0.2.0"
   package.json: "version": "0.2.0"
   lib/version.ts: const APP_VERSION = "0.2.0"
   ```

2. **Document changes** in this file under new version header

3. **Run `pnpm drizzle:generate`** if schema changed

4. **Commit & push**:

   ```bash
   git add app.json package.json lib/version.ts CHANGELOG.md drizzle/
   git commit -m "chore: release v0.2.0"
   git push origin main
   ```

5. **Auto-tag release**:

   ```bash
   pnpm release
   ```

   This automatically:
   - Extracts version from `app.json`
   - Creates git tag `v0.2.0`
   - Pushes tag to origin

6. **Build via EAS** (manual trigger in GitHub Actions):
   - Manually trigger `ios-build.yml` or `android-build.yml` for deployment

### Version Format (Beta)

- `0.MINOR.PATCH` (e.g., `0.1.0`, `0.2.5`)
- Increment `MINOR` for features + breaking changes (during beta, features may be breaking)
- Increment `PATCH` for bug fixes with no schema changes
- Use `-beta` suffix if unstable (e.g., `0.1.0-beta`)

**Keep all three files in sync** — `app.json`, `package.json`, `lib/version.ts`

---

## Notes for Next Release

- Keep track of schema changes in `docs/DRIZZLE.md`
- Always generates migrations before tagging release
- Commit migrations to git so users get them on pull
- Test on real device if possible (simulator may have different behavior)

# kharcha

personal expense tracking app for ios. built with expo, react native, and local-first sqlite storage.

---

## tech stack

expo (sdk 55) · expo-router · nativewind v4 · drizzle-orm · expo-sqlite · @tanstack/react-query · @tanstack/react-form · date-fns · biome · lefthook

---

## setup

```bash
git clone <repo>
cd kharcha
pnpm install
pnpm start
```

requirements: node >= 22.19.0 · pnpm >= 9.0.0 · ios simulator or expo go

---

## local ci

run `pnpm run local-ci` before pushing to catch lint, type, and dead code issues early:

```bash
pnpm run local-ci
```

this mirrors github actions ci locally. see [docs/CI.md](docs/CI.md) for detailed ci/cd workflows, build processes, troubleshooting, and secrets setup.

### documentation

- **[CI & Local Development](docs/CI.md)** — ci/cd workflows, local ci, eas builds, troubleshooting, secrets
- **[Architecture](docs/ARCHITECTURE.md)** — data flow, query layer, auth, styling
- **[Drizzle & Migrations](docs/DRIZZLE.md)** — schema management, dual migration strategy, version tracking
- **[Gmail Sync](docs/GMAIL_SYNC.md)** — oauth setup, platform-specific auth, email parsing, backend sync
- **[Android Debugging](docs/ANDROID_DEBUG.md)** — usb debugging, scrcpy, sha-1 setup, apk builds

---

## project structure

```
app/                          screens (expo-router file-based)
  _layout.tsx                 root layout, QueryClient, initDB, processSubscriptions, widget sync
  index.tsx                   home — ring, cards, projected spend, insights, budgets, breakdown, transactions
  add.tsx                     add transaction or subscription (switch toggle, duplicate detection)
  edit/[id].tsx               edit transaction
  history.tsx                 paginated list, filters, search, swipe-to-delete, export csv
  config.tsx                  categories, sources (reorder with up/down arrows)
  profile.tsx                 name, currency, gmail, app lock, budgets, subscriptions
  budgets.tsx                 per-category budget limits
  subscriptions/index.tsx     recurring subscriptions list
  subscriptions/audit.tsx     find unused subscriptions (>90 days since billing)
  edit-subscription/[id].tsx  edit subscription
  gmail-sync.tsx              gmail oauth + sync screen with verify + results
  export.tsx                  json backup export/import
  settings/sync.tsx           device sync with backend (register, forwarding email, sync)
  settings/banks.tsx          manage bank parsers
  settings/_layout.tsx        settings stack layout
  about.tsx                   app/device info (hidden network logger easter egg)
  network-logs.tsx            debug network requests (dev only)

components/
  transaction-form.tsx        shared add/edit form (lockType prop for subscriptions)
  subscription-form.tsx       subscription creation with day picker
  transaction-item.tsx        swipeable row with GMAIL/SUB badges, date headers
  duplicate-transaction-sheet.tsx  potential duplicate warning before save
  parse-message-sheet.tsx     AI-parsed email preview before save
  sync-results-sheet.tsx      added/duplicate/failed counts after sync
  export-sheet.tsx            export format options
  period-picker.tsx           date range picker with presets
  currency-picker.tsx         currency selection
  locked-screen.tsx           biometric lock screen
  error-boundary.tsx          crash recovery fallback
  ui/                         button, icon, input, text, chip-picker, bottom-sheet,
                              date-picker-modal, field-error, screen-header,
                              section-header, info-row

hooks/                        all data access — screens never call useQuery directly
  use-transactions.ts         queries + mutations + swipe-delete + invalidation
  use-categories.ts           category queries + mutations
  use-sources.ts              source queries + mutations
  use-budgets.ts              budget queries + mutations
  use-subscriptions.ts        subscription queries + mutations + toggle
  use-banks.ts                bank parser queries + mutations
  use-config.ts               currency, userName
  use-currency.ts             { currency, format } helper
  use-refresh.ts              pull-to-refresh (invalidates all queries)
  use-stats.ts                data stats for about screen
  use-sync-state.ts           gmail + device sync state
  use-debounce.ts             generic debounce (used by history search)
  use-app-lock.ts             biometric authentication state
  use-feature-flags.ts        backend feature flags (gmail sync visibility)

lib/db/
  schema.ts                   drizzle tables + inferred types (InferSelectModel)
  connection.ts               sqlite connection + drizzle migrations runner
  index.ts                    initDB (inline CREATE TABLE safety net), seeds, transaction queries
  types.ts                    shared types (TransactionRow, etc.)
  config.ts                   key-value config (currency, userName, gmail_*, app_lock_*)
  budgets.ts                  budget queries + getCategorySpent
  subscriptions.ts            subscription queries + processSubscriptions
  categories.ts               category CRUD + reordering
  sources.ts                  source CRUD + reordering
  banks.ts                    bank + bank_emails CRUD
  stats.ts                    getDataStats (parallel queries)
  backup.ts                   export/import database as JSON

lib/gmail/
  auth.ts                     useGoogleAuth hook (oauth, token refresh, secure store)
  parsers/                    bank email parsers (12 banks, see below)
  sync.ts                     gmail API fetch + parse + dedup + insert

lib/gemini/                   gemini AI fallback for unrecognized email formats
lib/export/                   csv export for history
lib/
  env.ts                      required env validation (alert on missing vars)
  constants.ts                SCREENS, QUERY_KEYS, COLORS, CONFIG_KEYS, TOAST_TYPE, TRANSACTION_TYPE
  toast.ts                    showErrorToast, showSuccessToast, showUndoToast helpers
  format.ts                   formatCurrency, parseDate, buildListData
  utils.ts                    cn(), isIOS
  version.ts                  compareVersions, isUpgrade, isMajorUpgrade
  widget.ts                   iOS home screen widget data sync

kharcha-backend/              bun + hono backend for email-based sync
  src/                        api routes, bank parsers, drizzle + postgres
  docker-compose.yml          postgres + app containers
```

---

## database

8 tables in `lib/db/schema.ts`:

```
categories    (id, name, type, is_default, sort_order)
sources       (id, name, is_default, sort_order)
subscriptions (id, name, amount, billing_day, category_id, source_id, is_active, created_at)
transactions  (id, type, amount, merchant, category_id, source_id, destination_source_id, subscription_id, source_type, gmail_message_id, date, note, created_at)
budgets       (id, category_id UNIQUE, amount)
banks         (id, name, parser_key, is_default, is_active)
bank_emails   (id, bank_id, email, is_default)
config        (key PK, value)
```

types auto-inferred via drizzle — no manual duplication. `TransactionRow` extends `Transaction` with joined `category_name` + `source_name`.

---

## query architecture

```
sqlite <- drizzle-orm <- lib/db/*.ts <- hooks/use-*.ts <- screens
```

- **staleTime: 10s** — prevents duplicate calls within 10 seconds. data updates via `invalidateQueries` after mutations.
- **gcTime: 30 min** — cache kept longer since it's cheap local data.
- **pull-to-refresh** on home + history + subscriptions screens — invalidates all queries.
- all query keys centralized in `QUERY_KEYS`. hooks handle invalidation internally.
- env vars validated at startup via `lib/env.ts` — alert if required vars are missing.

---

## features

**home screen** — spending ring, income/spent cards, projected spending range (low/high), monthly insights (top category trend, today's spend), category breakdown with budget-colored progress bars, upcoming subscriptions, recent transactions. fully scrollable.

**ios home screen widget** — current month expenses, category breakdown percentages, projected spend range, today's spend. syncs via app groups on startup and foreground.

**ios quick actions** — long-press app icon for "Add Expense", "Transactions", or "Budgets".

**budgets** — per-category limits. bars go purple -> orange (75%) -> red (100%+). budget warning toasts on add.

**subscriptions** — recurring expenses with billing day (1-31). auto-creates transactions on app launch via `processSubscriptions()`. pause/resume toggle. subscription audit to find unused subscriptions (>90 days since last billing).

**transfers** — move money between sources with destination tracking.

**multi-currency** — INR/USD/GBP/EUR and more. stored in config table. `useCurrency()` hook provides `format()` everywhere.

**gmail sync** — on-device oauth -> gmail API -> parse bank emails -> dedup -> insert. supports 12 banks: axis, hdfc, icici, sbi, kotak, indusind, standard chartered, idfc, citi, hsbc, fintech cards. gemini AI fallback for unrecognized formats. see [docs/GMAIL_SYNC.md](docs/GMAIL_SYNC.md).

**device sync** — backend (bun + hono + postgres) with postmark inbound email webhooks. forward bank alerts to a unique email address, backend parses and stores, mobile app syncs via HTTP.

**duplicate detection** — warns before saving if a transaction with the same date + amount + note already exists.

**auto-categorisation** — gemini AI suggests categories for parsed bank transactions.

**app lock** — optional biometric authentication (face id / touch id) on app launch and foreground.

**history** — paginated transactions with advanced filters (type, source, date range with presets, category, merchant search). export to csv. swipe-to-delete with 5s undo toast.

**export/import** — full database backup as JSON. import restores all tables.

**config** — manage categories (income/expense) and sources (payment methods). reorder with up/down arrows. mark defaults.

---

## commands

```bash
pnpm start         # expo dev server
pnpm ios           # run on ios simulator
pnpm lint          # biome check
pnpm lint:fix      # biome check + auto-fix
pnpm typecheck     # tsc --noEmit
pnpm quality       # lint + typecheck
pnpm dead-code     # knip dead code detection
pnpm run local-ci  # full ci pipeline (before push)
```

---

## ci/cd

**local**: `pnpm run local-ci` — lint, type check, audit, dead code detection (run before push)

**github actions**:
- `ci.yml` — push/PR to main -> quality checks (lint, typecheck, audit, knip)
- `ios-build.yml` — manual trigger -> EAS build -> TestFlight submission
- `android-build.yml` — manual trigger -> EAS build -> APK release

see [docs/CI.md](docs/CI.md) for detailed workflows, when to use which, environment setup, and troubleshooting.

pnpm version from `packageManager` in package.json. node 22.

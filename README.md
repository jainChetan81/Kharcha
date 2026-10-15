# kharcha

personal expense tracking app for ios + android. built with expo, react native, and local-first sqlite storage.

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

requirements: node >= 22.19.0 · pnpm >= 9.0.0 · ios simulator or android emulator (development build — custom native plugins, expo go not supported)

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
- **[Gmail Sync](docs/GMAIL_SYNC.md)** — oauth setup, platform-specific auth, on-device email parsing
- **[Android Debugging](docs/ANDROID_DEBUG.md)** — usb debugging, scrcpy, sha-1 setup, apk builds
- **[Release](docs/RELEASE.md)** — release process, local builds, OTA updates

---

## project structure

```
app/                          screens (expo-router file-based)
  _layout.tsx                 root layout, QueryClient, initDB, processSubscriptions, widget sync
  index.tsx                   home — ring, cards, projected spend, insights, budgets, breakdown, transactions
  add.tsx                     add transaction or subscription (switch toggle, duplicate detection)
  edit/[id].tsx               edit transaction
  edit-subscription/[id].tsx  edit subscription
  history.tsx                 paginated list, filters, search, swipe-to-delete, export csv
  insights.tsx                spending trends, heatmap, monthly wrap
  portfolio.tsx               holdings overview
  reimbursements.tsx          reimbursable expense tracking
  tag/[id].tsx                tag detail + scoped transactions
  config/                     categories (expense/income), sources, tags, currency
  budgets.tsx                 per-category budget limits
  subscriptions/index.tsx     recurring subscriptions list (+ unused-subscription audit section)
  holding/[id].tsx            holding detail
  gmail-sync.tsx              gmail oauth + sync screen with verify + results
  export.tsx                  json backup export/import
  settings/banks.tsx          manage bank parsers
  settings/_layout.tsx        settings stack layout
  profile.tsx                 name, currency, app lock, cloud backup, about links
  about.tsx                   app/device info

components/
  transaction-form.tsx        shared add/edit form (lockType prop for subscriptions)
  subscription-form.tsx       subscription creation with day picker
  transaction-item.tsx        swipeable row with badges, date headers
  duplicate-transaction-sheet.tsx  potential duplicate warning before save
  parse-message-sheet.tsx     AI-parsed email preview before save
  sync-results-sheet.tsx      added/duplicate/failed counts after sync
  export-sheet.tsx            export format options
  import-preview-sheet.tsx    backup import preview
  history-filters-sheet.tsx   advanced history filters
  period-picker.tsx           date range picker with presets
  currency-picker.tsx         currency selection
  locked-screen.tsx           biometric lock screen
  boot-error-screen.tsx       db/boot failure fallback with retry
  error-boundary.tsx          crash recovery fallback
  monthly-wrap-gate.tsx       end-of-month wrap prompt
  spending-heatmap.tsx        calendar heatmap of daily spend
  quick-start-tag-sheet.tsx / quick-duration-sheet.tsx  ⚡ tag start flow
  add-holding-sheet.tsx / investment-fields.tsx         portfolio entry
  ui/                         27 primitives — button, icon, input, text, chip-picker,
                              bottom-sheet, date-picker-modal, segmented-control,
                              stacked-bar, empty-state, screen-header, …

hooks/                        all data access — screens never call useQuery directly (31 hooks)
  use-transactions.ts         queries + mutations + swipe-delete + invalidation
  use-home-data.ts            home screen aggregation
  use-insights-data.ts        insights screen data
  use-history-filters.ts      filter state for history
  use-categories.ts / use-sources.ts / use-budgets.ts / use-subscriptions.ts
  use-tags.ts / use-tag-sheets.tsx / use-holdings.ts
  use-mini-sync.ts            mini server pull/push sync
  use-cloud-backup.ts / use-cloud-backup-ui.ts    gdrive + icloud backup
  use-gmail-sync.ts / use-gmail-sync-ui.ts        gmail sync state
  use-banks.ts                bank parser queries + mutations
  use-config.ts / use-currency.ts / use-refresh.ts / use-stats.ts
  use-debounce.ts / use-app-lock.ts / use-app-update.ts / use-auto-refresh-prefs.ts

lib/db/
  schema.ts                   drizzle tables + inferred types (InferSelectModel)
  connection.ts               sqlite connection + drizzle migrations runner
  index.ts                    initDB (migrations first, inline CREATE TABLE safety net), seeds, transaction queries
  types.ts                    shared types (TransactionRow, etc.)
  config.ts                   key-value config (currency, userName, mini_*, app_lock_*)
  budgets.ts / subscriptions.ts / categories.ts / sources.ts
  banks.ts                    bank + bank_emails CRUD
  holdings.ts                 investment holdings CRUD
  tags.ts                     tags + transaction_tags CRUD
  stats.ts / backup.ts / files.ts / inspect.ts

lib/gmail/                    frozen fallback capture path (see V2_MINI_PLAN.md)
  auth.ts                     useGoogleAuth hook (oauth, token refresh, secure store)
  parsers/                    bank email parsers (11 banks)
  sync.ts                     gmail API fetch + parse + dedup + insert

lib/parsers/                  per-bank SMS regex fast-path for the AI-paste sheet
lib/gemini/                   gemini AI fallback for unrecognized formats
lib/mini-sync.ts              mini server sync (pull + push, two-tier dedupe)
lib/cloud-backup/             gdrive + icloud database backup/restore
lib/export/                   csv + json export
lib/firebase/                 analytics, crashlytics, __DEV__-gated logging wrapper
lib/
  env.ts                      required env validation
  constants.ts                SCREENS, QUERY_KEYS, COLORS, CONFIG_KEYS, TOAST_TYPE, …
  toast.ts / alerts.ts        toasts + native alert helpers
  format.ts / date.ts         formatting + date helpers
  tag-duration.ts / tag-status.ts   tag scope lifecycle
  utils.ts                    cn(), isIOS
  widget.ts                   iOS home screen widget data sync
widgets/                      ios home-screen widget (swift)
```

---

## database

11 tables in `lib/db/schema.ts` (key columns shown; schema.ts is the source of truth):

```
categories       (id, name, type, is_default, sort_order)
sources          (id, name, is_default, sort_order)
subscriptions    (id, name, amount, billing_day(s), category_id, source_id, type, holding_id, investment_kind, is_active, created_at)
holdings         (id, name, instrument_type, units, avg_cost, invested, is_closed, sort_order, created_at)
transactions     (id, type, amount, merchant, category_id, source_id, destination_source_id, subscription_id, holding_id, source_type, gmail_message_id, mini_transaction_id, parsed_by, date, note, created_at, ...)
budgets          (id, category_id UNIQUE, amount)
banks            (id, name, parser_key, is_default, is_active)
bank_emails      (id, bank_id, email, is_default)
config           (key PK, value)
tags             (id, name UNIQUE, sort_order, start_date, end_date, color, emoji, created_at)
transaction_tags (transaction_id, tag_id) PK
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

**tags** — #tag expenses into scopes (trips, projects) with start/end duration. new transactions auto-tag while a scope is active. tag detail screen with status badge + scoped transaction list.

**portfolio & holdings** — track investments: holdings with units/avg cost, portfolio overview screen, per-holding detail. investment subscriptions feed holdings.

**insights** — dedicated insights screen: spending heatmap, top-category trends, monthly wrap (end-of-month recap card).

**reimbursements** — mark expenses as reimbursable and track what's owed back.

**mini sync** — sms/server-based capture via the kharcha-mini companion (`lib/mini-sync.ts`). primary transaction source per [docs/V2_MINI_PLAN.md](docs/V2_MINI_PLAN.md). two-tier dedupe (`mini_transaction_id` primary, heuristic fallback). wired into pull-to-refresh + app foreground.

**cloud backup** — database backup/restore to google drive (android) + icloud (ios). restore re-runs migrations + column back-fills automatically.

**sms paste parsing** — paste any bank sms into the add flow: local regex fast-path (`lib/parsers/`) for known banks, gemini AI fallback otherwise.

**ios home screen widget** — current month expenses, category breakdown percentages, projected spend range, today's spend. syncs via app groups on startup and foreground.

**ios quick actions** — long-press app icon for "Add Expense", "Transactions", or "Budgets".

**budgets** — per-category limits. bars go purple -> orange (75%) -> red (100%+). budget warning toasts on add.

**subscriptions** — recurring expenses with billing day (1-31). auto-creates transactions on app launch via `processSubscriptions()`. pause/resume toggle. unused-subscription audit (>90 days since last billing) inside the subscriptions screen.

**transfers** — move money between sources with destination tracking.

**multi-currency** — INR/USD/GBP/EUR and more. stored in config table. `useCurrency()` hook provides `format()` everywhere.

**gmail sync (frozen fallback)** — on-device oauth -> gmail API -> parse bank emails -> dedup -> insert. 11 banks: axis, hdfc, icici, sbi, kotak, indusind, standard chartered, idfc, citi, hsbc, fintech cards. gemini AI fallback for unrecognized formats. kept working but frozen behind the mini pipeline — see [docs/V2_MINI_PLAN.md](docs/V2_MINI_PLAN.md) and [docs/GMAIL_SYNC.md](docs/GMAIL_SYNC.md).

**duplicate detection** — warns before saving if a transaction with the same date + amount + note already exists.

**auto-categorisation** — gemini AI suggests categories for parsed bank transactions.

**app lock** — optional biometric authentication (face id / touch id) on app launch and foreground.

**history** — paginated transactions with advanced filters (type, source, date range with presets, category, merchant search). export to csv. swipe-to-delete with 5s undo toast.

**export/import** — full database backup as JSON. import restores all tables.

**config** — manage expense/income categories, sources (payment methods), tags, and currency. reorder with up/down arrows. mark defaults.

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

**local**: `pnpm run local-ci` — lint, type check, dead code detection, audit (run before push)

**github actions**:
- `ci.yml` — push/PR to main -> quality checks (lint, typecheck, audit, knip)
- `ios-build.yml` — manual trigger -> EAS build -> TestFlight submission
- `android-build.yml` — manual trigger -> EAS build -> APK release

see [docs/CI.md](docs/CI.md) for detailed workflows, when to use which, environment setup, and troubleshooting.

pnpm version from `packageManager` in package.json. node 22.

# architecture

## data flow

```
sqlite <- drizzle-orm <- lib/db/*.ts <- hooks/use-*.ts <- screens
```

screens never call `useQuery`/`useMutation` directly. all data access goes through custom hooks. hooks handle query keys and invalidation internally.

---

## database layer

```
lib/db/schema.ts        drizzle table definitions + inferred types
lib/db/types.ts         shared types (TransactionRow, etc.)
lib/db/connection.ts    sqlite connection + drizzle migrations runner
lib/db/index.ts         initDB, seeds, transaction queries, shared db instance
lib/db/config.ts        key-value config store (currency, userName, gmail_*, app_lock_*)
lib/db/budgets.ts       budget queries + getCategorySpent
lib/db/subscriptions.ts subscription queries + processSubscriptions
lib/db/categories.ts    category CRUD + reordering
lib/db/sources.ts       source CRUD + reordering
lib/db/banks.ts         bank + bank_emails CRUD
lib/db/stats.ts         getDataStats (parallel queries via Promise.all)
lib/db/backup.ts        export/import full database as JSON
```

single shared `db` instance created in `connection.ts`, imported by all other db files.

two migration strategies run on every app launch (see [DRIZZLE.md](DRIZZLE.md) for details):

1. **inline `CREATE TABLE IF NOT EXISTS`** in `initDB()` — safety net for fresh installs where Drizzle migrations may not exist yet
2. **Drizzle migrations** via `migrate(db, migrations)` in `connection.ts` — applies generated SQL from `drizzle/` for incremental schema changes

both must be kept in sync with `lib/db/schema.ts` to avoid drift (e.g. missing columns on fresh installs).

---

## query layer (tanstack query)

global config in `_layout.tsx`:

- **staleTime: 10s** — prevents rapid duplicate calls
- **gcTime: 30min** — keeps cache since it's cheap local data

all query keys in `lib/constants.ts` -> `QUERY_KEYS`. hooks invalidate related keys after mutations via `useInvalidateTransactions()` pattern.

pull-to-refresh on home + history + subscriptions — calls `queryClient.invalidateQueries()`.

---

## hooks

```
hooks/
  use-transactions.ts    queries + mutations + swipe-delete + invalidation
  use-categories.ts      CRUD for categories
  use-sources.ts         CRUD for sources
  use-budgets.ts         budget limits per category
  use-subscriptions.ts   recurring subscriptions + toggle
  use-banks.ts           bank parser queries + mutations
  use-config.ts          app config (AppConfig type)
  use-currency.ts        { currency, format } — wraps useCurrency for formatting
  use-debounce.ts        generic useDebounce hook (used by history search)
  use-refresh.ts         pull-to-refresh (invalidates all queries)
  use-stats.ts           data stats for about screen
  use-sync-state.ts      gmail + device sync state (last synced, emails fetched, etc.)
  use-app-lock.ts        biometric authentication state + lock/unlock
  use-feature-flags.ts   backend feature flags (gmail sync visibility per user)
```

---

## auth

platform-specific google OAuth:

- **iOS**: `expo-auth-session` with iOS OAuth client ID + native redirect
- **Android**: `@react-native-google-signin/google-signin` with native Google Play Services

see [GMAIL_SYNC.md](GMAIL_SYNC.md) for full details.

---

## app lock

optional biometric authentication via `expo-local-authentication`:

- toggled in profile screen, stored in config table (`app_lock_enabled`)
- `use-app-lock.ts` hook manages lock state
- `LockedScreen` component shown when locked
- prompts on cold start if enabled
- re-authenticates on app backgrounding
- fallback to passcode if biometrics unavailable

---

## env validation

`lib/env.ts` validates required env vars at module load time. shows `Alert.alert()` if missing — app continues but gmail sync won't work.

---

## screens (expo-router)

file-based routing in `app/`. every screen exports `ErrorBoundary = ScreenError` for crash recovery.

navigation: custom bottom tab bar in `index.tsx` (not expo-router tabs). 5 tabs + center FAB.

---

## ios home screen widget

`lib/widget.ts` syncs spending data to the native iOS widget via app groups (`group.com.chetanjain.kharcha`):

- current month total expenses
- category breakdown with percentages
- projected spend range (low/high)
- today's spend
- previous month comparison

data synced on app startup and foreground transitions in `_layout.tsx`.

---

## styling

nativewind v4 (tailwind for react native). semantic color tokens defined in `tailwind.config.js`. no inline `style` prop except for:

- shadow properties (not supported by nativewind)
- dynamic values (e.g. progress bar width percentages)
- third-party components (DateTimePicker, PieChart)

color constants in `lib/constants.ts` -> `COLORS` for values used in JS (not className).

---

## forms

tanstack form for all user input. shared `TransactionForm` component used by add + edit screens. separate `SubscriptionForm` for subscription creation.

`TransactionForm` accepts `lockType` prop to disable income toggle for subscription transactions. `onDelete` prop enables a Delete/Save button row in edit mode.

duplicate detection: before saving, checks for existing transactions with same date + amount + note. shows `DuplicateTransactionSheet` warning if found.

---

## email parsing pipeline

```
gmail API message -> bank-specific regex parser -> extract (amount, date, merchant)
                  -> if regex fails -> gemini 1.5 flash AI fallback
                  -> auto-categorisation suggestion
                  -> dedup check (same date + amount + note)
                  -> insert with source_type='synced'
```

12 bank parsers in `lib/gmail/parsers/`. gemini AI in `lib/gemini/`. see [GMAIL_SYNC.md](GMAIL_SYNC.md) for full details.

---

## backend (kharcha-backend)

bun + hono API with postgres for device-based email sync:

- register device -> get unique forwarding email
- postmark inbound webhooks parse bank alert emails
- mobile app syncs via GET /sync with device_id header
- feature flags control gmail sync visibility per user

see [GMAIL_SYNC.md](GMAIL_SYNC.md) for backend endpoints and sync flow.

---

## haptic feedback

`expo-haptics` provides tactile feedback on key actions:

- **add transaction**: success notification on insert
- **device sync**: success notification when new transactions synced (skipped if none added)
- **swipe to delete**: impact feedback on threshold

---

## version tracking

`lib/version.ts` provides `compareVersions()`, `isUpgrade()`, `isMajorUpgrade()`. app version and schema version stored in config table. on startup, `initDB()` detects upgrades and runs version-specific migration logic if needed. see [DRIZZLE.md](DRIZZLE.md) for details.

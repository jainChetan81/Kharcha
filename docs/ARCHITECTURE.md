# architecture

## data flow

```
sqlite ← drizzle-orm ← lib/db/*.ts ← hooks/use-*.ts ← screens
```

screens never call `useQuery`/`useMutation` directly. all data access goes through custom hooks. hooks handle query keys and invalidation internally.

---

## database layer

```
lib/db/schema.ts        drizzle table definitions + inferred types
lib/db/index.ts         initDB, seeds, transaction queries, shared db instance
lib/db/config.ts        key-value config store (currency, userName, gmail_*)
lib/db/budgets.ts       budget queries + getCategorySpent
lib/db/subscriptions.ts subscription queries + processSubscriptions
```

single shared `db` instance created in `index.ts`, imported by all other db files.

two migration strategies run on every app launch (see [DRIZZLE.md](DRIZZLE.md) for details):

1. **inline `CREATE TABLE IF NOT EXISTS`** in `initDB()` — safety net for fresh installs where Drizzle migrations may not exist yet
2. **Drizzle migrations** via `migrate(db, migrations)` in `connection.ts` — applies generated SQL from `drizzle/` for incremental schema changes

both must be kept in sync with `lib/db/schema.ts` to avoid drift (e.g. missing columns on fresh installs).

---

## query layer (tanstack query)

global config in `_layout.tsx`:

- **staleTime: 10s** — prevents rapid duplicate calls
- **gcTime: 30min** — keeps cache since it's cheap local data

all query keys in `lib/constants.ts` → `QUERY_KEYS`. hooks invalidate related keys after mutations via `useInvalidateTransactions()` pattern.

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
  use-config.ts          app config (AppConfig type)
  use-currency.ts        { currency, format } — wraps useCurrency for formatting
  use-refresh.ts         pull-to-refresh (invalidates all queries)
  use-stats.ts           data stats for about screen
```

---

## auth

platform-specific google OAuth:

- **iOS**: `expo-auth-session` with iOS OAuth client ID + native redirect
- **Android**: `@react-native-google-signin/google-signin` with native Google Play Services

see [GMAIL_SYNC.md](GMAIL_SYNC.md) for full details.

---

## env validation

`lib/env.ts` validates required env vars at module load time. shows `Alert.alert()` if missing — app continues but gmail sync won't work.

---

## screens (expo-router)

file-based routing in `app/`. every screen exports `ErrorBoundary = ScreenError` for crash recovery.

navigation: custom bottom tab bar in `index.tsx` (not expo-router tabs). 5 tabs + center FAB.

---

## styling

nativewind v4 (tailwind for react native). semantic color tokens defined in `tailwind.config.js`. no inline `style` prop except for:

- shadow properties (not supported by nativewind)
- dynamic values (e.g. progress bar width percentages)
- third-party components (DateTimePicker, PieChart)

color constants in `lib/constants.ts` → `COLORS` for values used in JS (not className).

---

## forms

tanstack form for all user input. shared `TransactionForm` component used by add + edit screens. separate `SubscriptionForm` for subscription creation.

`TransactionForm` accepts `lockType` prop to disable income toggle for subscription transactions.

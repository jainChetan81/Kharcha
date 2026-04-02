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

## project structure

```
app/                          screens (expo-router file-based)
  _layout.tsx                 root layout, QueryClient, initDB, processSubscriptions
  index.tsx                   home — ring, cards, comparison, budgets, breakdown, transactions
  add.tsx                     add transaction or subscription (switch toggle)
  edit/[id].tsx               edit transaction
  history.tsx                 paginated list, filters, swipe-to-delete
  config.tsx                  categories, sources, clear data
  profile.tsx                 name, currency, gmail, budgets, subscriptions
  budgets.tsx                 per-category budget limits
  subscriptions.tsx           recurring subscriptions list
  edit-subscription/[id].tsx  edit subscription (billing day locked)
  gmail-sync.tsx              gmail oauth + sync screen
  about.tsx                   app/device info

components/
  transaction-form.tsx        shared add/edit form (lockType prop for subscriptions)
  subscription-form.tsx       subscription creation with day picker
  transaction-item.tsx        swipeable row with SUB badge for subscriptions
  ui/                         button, card, icon, input, select, text

hooks/                        all data access — screens never call useQuery directly
  use-transactions.ts         queries + mutations + swipe-delete + invalidation
  use-categories.ts           category queries + mutations
  use-sources.ts              source queries + mutations
  use-budgets.ts              budget queries + mutations
  use-subscriptions.ts        subscription queries + mutations + toggle
  use-config.ts               currency, userName (AppConfig type)
  use-currency.ts             { currency, format } helper
  use-refresh.ts              pull-to-refresh (invalidates all queries)
  use-stats.ts                data stats

lib/db/
  schema.ts                   drizzle tables + inferred types (InferSelectModel)
  index.ts                    initDB, seeds, transaction queries, shared db instance
  config.ts                   key-value config (currency, userName, gmail_*)
  budgets.ts                  budget queries + getCategorySpent
  subscriptions.ts            subscription queries + processSubscriptions

lib/gmail/
  auth.ts                     useGoogleAuth hook (oauth, token refresh, secure store)
  parser.ts                   axis bank + hdfc email parsing
  sync.ts                     gmail API fetch + parse + dedup + insert

lib/
  env.ts                      required env validation (crashes on missing vars)
  constants.ts                SCREENS, QUERY_KEYS, COLORS, TOAST_TYPE, TRANSACTION_TYPE
  format.ts                   formatCurrency, parseDate, buildListData
  utils.ts                    cn(), isIOS
```

---

## database

7 tables in `lib/db/schema.ts`:

```
categories    (id, name, type, is_default)
sources       (id, name, is_default)
subscriptions (id, name, amount, billing_day, category_id, source_id, is_active)
transactions  (id, type, amount, merchant, category_id, source_id, subscription_id, date, note)
budgets       (id, category_id UNIQUE, amount)
config        (key PK, value)
```

types auto-inferred via drizzle — no manual duplication. `TransactionRow` extends `Transaction` with joined `category_name` + `source_name`.

**schema changes**: edit `lib/db/schema.ts`, then run `pnpm drizzle:generate` to create a timestamped SQL migration in `drizzle/`. commit both the schema and migration files. migrations tracked in `drizzle/meta` for version control.

---

## query architecture

```
sqlite ← drizzle-orm ← lib/db/*.ts ← hooks/use-*.ts ← screens
```

- **staleTime: 10s** — prevents duplicate calls within 10 seconds. data updates via `invalidateQueries` after mutations.
- **gcTime: 30 min** — cache kept longer since it's cheap local data.
- **pull-to-refresh** on home + subscriptions screens — invalidates all queries.
- all query keys centralized in `QUERY_KEYS`. hooks handle invalidation internally.
- env vars validated at bundle time via `lib/env.ts` — app crashes immediately if required vars are missing.

---

## features

**home screen** — spending ring, income/spent cards, month-vs-last-month comparison, category breakdown with budget-colored progress bars, subscription total, recent transactions. fully scrollable.

**budgets** — per-category limits. bars go purple → orange (75%) → red (100%+). budget warning toasts on add.

**subscriptions** — recurring expenses with billing day (1-31). auto-creates transactions on app launch via `processSubscriptions()`. pause/resume toggle. billing day locked after creation.

**multi-currency** — INR/USD/GBP/EUR. stored in config table. `useCurrency()` hook provides `format()` everywhere.

**gmail sync** — on-device oauth → gmail API → parse axis/hdfc bank emails → dedup → insert. see [docs/GMAIL_SYNC.md](docs/GMAIL_SYNC.md).

**swipe to delete** — history screen, 70% threshold, 5s undo toast.

**ios quick actions** — long-press app icon for "Add Expense" or "Transactions".

---

## commands

```bash
pnpm start           # expo dev server (port 8082)
pnpm ios             # run on ios simulator
pnpm lint            # biome check
pnpm lint:fix        # biome check + auto-fix
pnpm typecheck       # tsc --noEmit
pnpm quality         # lint + typecheck
pnpm drizzle:generate  # generate sql migration from schema changes
pnpm drizzle:studio    # visual db inspector (web UI)
```

---

## ci/cd

| workflow | trigger | action |
|---|---|---|
| `ci.yml` | push/PR to main | lint + typecheck |
| `ios-build.yml` | manual | EAS build → TestFlight |
| `android-build.yml` | manual | EAS build → APK artifact |

pnpm version from `packageManager` in package.json · node 22.

---

## docs

- [Architecture](docs/ARCHITECTURE.md) — data flow, query layer, auth, styling
- [Drizzle ORM & Migrations](docs/DRIZZLE.md) — schema management, migration workflow, best practices
- [Gmail Sync](docs/GMAIL_SYNC.md) — oauth setup, platform-specific auth, email parsing

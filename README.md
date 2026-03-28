# kharcha

personal expense tracking app for ios. built with expo, react native, and local-first sqlite storage.

---

## tech stack

| package | purpose |
|---|---|
| expo (sdk 55) | managed react native runtime |
| expo-router | file-based navigation |
| nativewind v4 | tailwind css for react native |
| react-native-reusables | shadcn-style ui primitives |
| drizzle-orm | type-safe sqlite orm |
| @tanstack/react-query | data fetching + caching + mutations |
| @tanstack/react-form | form state management |
| expo-sqlite | local sqlite database |
| expo-quick-actions | ios home screen quick actions |
| date-fns | date formatting and manipulation |
| react-native-gifted-charts | pie/donut charts |
| zod | schema validation |
| biome | linting + formatting |
| lefthook | git hooks |

---

## project structure

```
kharcha/
├── app/                        # screens (expo-router file-based)
│   ├── _layout.tsx             # root layout, QueryClientProvider, initDB, quick actions
│   ├── index.tsx               # home screen
│   ├── add.tsx                 # add transaction
│   ├── edit/[id].tsx           # edit transaction
│   ├── history.tsx             # transaction history with filters
│   ├── settings.tsx            # categories, sources, currency, data management
│   ├── profile.tsx             # user profile, budgets, subscriptions
│   ├── budgets.tsx             # monthly budget limits per category
│   ├── subscriptions.tsx       # recurring subscription management
│   ├── edit-subscription/[id].tsx  # edit subscription (billing day locked)
│   └── about.tsx               # app + device info
├── components/
│   ├── transaction-form.tsx    # shared form for add/edit transactions
│   ├── subscription-form.tsx   # subscription creation form
│   ├── transaction-item.tsx    # swipeable transaction row + date header
│   ├── error-boundary.tsx      # screen error boundary
│   └── ui/                     # rn-reusables components
│       ├── button.tsx
│       ├── card.tsx
│       ├── icon.tsx
│       ├── input.tsx
│       ├── select.tsx
│       └── text.tsx
├── hooks/                      # custom react query hooks
│   ├── use-transactions.ts     # transaction queries + mutations
│   ├── use-categories.ts       # category queries + mutations
│   ├── use-sources.ts          # source queries + mutations
│   ├── use-budgets.ts          # budget queries + mutations
│   ├── use-subscriptions.ts    # subscription queries + mutations
│   ├── use-settings.ts         # app settings (currency, userName)
│   ├── use-currency.ts         # currency formatting hook
│   └── use-stats.ts            # data stats query
├── lib/
│   ├── db/
│   │   ├── schema.ts           # drizzle table definitions + inferred types
│   │   ├── index.ts            # db init, seeds, transaction queries
│   │   ├── settings.ts         # settings queries
│   │   ├── budgets.ts          # budget queries
│   │   └── subscriptions.ts    # subscription queries + auto-processing
│   ├── constants.ts            # screens, query keys, colors, toast types
│   ├── format.ts               # currency formatting, date labels, list builders
│   └── utils.ts                # cn(), isIOS, isAndroid, isWeb
├── types/
│   └── global.d.ts             # global utility types (Prettify<T>)
├── .nvmrc                      # node version (22.19.0)
├── .npmrc                      # engine-strict + hoisted node-linker
├── biome.json
├── lefthook.yml
├── CLAUDE.md
└── README.md
```

---

## screens

| screen | file | description |
|---|---|---|
| home | `app/index.tsx` | spending ring, income/spent cards, month comparison, category breakdown with budget bars, recent transactions |
| add | `app/add.tsx` | add transaction or subscription (switch toggle), income/expense type, budget warning toasts |
| edit | `app/edit/[id].tsx` | edit transaction (type locked for subscription transactions, shows SUB badge) |
| history | `app/history.tsx` | paginated transaction list with filter modal (type, category, source, month), swipe-to-delete with undo |
| settings | `app/settings.tsx` | currency picker, manage categories (expense/income), manage sources, clear data, about link |
| profile | `app/profile.tsx` | editable user name, budgets + subscriptions links |
| budgets | `app/budgets.tsx` | set/edit/remove budget limits per expense category |
| subscriptions | `app/subscriptions.tsx` | list subscriptions (this month/upcoming), toggle active/paused, long-press to delete |
| edit subscription | `app/edit-subscription/[id].tsx` | edit name, amount, category, source (billing day read-only) |
| about | `app/about.tsx` | app version, device info, data stats |

### bottom tab navigation

5 tabs with centre FAB button:

| tab | icon | screen |
|---|---|---|
| home | `House` | home |
| history | `Clock` | history |
| add | `Plus` (FAB) | add transaction |
| settings | `Settings` | settings |
| profile | `User` | profile |

### ios quick actions

long-press app icon for:
- "Add Expense" → opens add screen with expense pre-selected
- "Transactions" → opens history screen

---

## database

### schema (drizzle orm)

6 tables defined in `lib/db/schema.ts` with drizzle inferred types:

```
categories    (id, name, type: income|expense, is_default)
sources       (id, name, is_default)
subscriptions (id, name, amount, billing_day, category_id, source_id, is_active, created_at)
transactions  (id, type, amount, merchant, category_id, source_id, subscription_id, date, note, created_at)
budgets       (id, category_id UNIQUE, amount)
settings      (key PRIMARY KEY, value)
```

types are auto-inferred via `InferSelectModel` / `InferInsertModel` — no manual type duplication.

### seeds

on first launch, `initDB()` seeds:
- **categories:** food, transport, shopping, utilities, entertainment, health, other (expense) + salary, freelance, refunds, investments, other (income)
- **sources:** cash, upi, credit card, debit card
- **settings:** currency=INR, userName=User
- **transactions:** ~30 sample transactions across current and previous month

### query architecture

```
lib/db/schema.ts     → table definitions + types
lib/db/index.ts      → initDB, transaction queries, shared db instance
lib/db/settings.ts   → getSetting, getAllSettings, updateSetting
lib/db/budgets.ts    → getBudgets, setBudget, deleteBudget, getCategorySpent
lib/db/subscriptions.ts → getSubscriptions, addSubscription, processSubscriptions, toggleSubscription
```

all query files import the shared `db` instance from `lib/db/index.ts`.

---

## hooks

all data access goes through custom hooks in `hooks/`. screens never call `useQuery`/`useMutation` directly.

| hook | file | provides |
|---|---|---|
| `useRecentTransactions` | use-transactions.ts | recent transactions query |
| `useMonthlySummary` | use-transactions.ts | monthly income/expense totals |
| `useCategoryBreakdown` | use-transactions.ts | top 5 expense categories |
| `useTransactionsPaginated` | use-transactions.ts | infinite query with filters |
| `useInsertTransaction` | use-transactions.ts | insert mutation |
| `useUpdateTransaction` | use-transactions.ts | update mutation |
| `useSwipeDelete` | use-transactions.ts | delete + undo toast logic |
| `useAllCategories` | use-categories.ts | all categories query |
| `useCategoriesByType` | use-categories.ts | filtered by income/expense |
| `useAddCategory` / `useDeleteCategory` | use-categories.ts | category mutations |
| `useAllSources` | use-sources.ts | all sources query |
| `useAddSource` / `useDeleteSource` | use-sources.ts | source mutations |
| `useBudgets` | use-budgets.ts | all budgets query |
| `useSetBudget` / `useDeleteBudget` | use-budgets.ts | budget mutations |
| `useSubscriptions` | use-subscriptions.ts | all subscriptions query |
| `useSubscriptionById` | use-subscriptions.ts | single subscription query |
| `useSubscriptionsTotal` | use-subscriptions.ts | active subscriptions total amount |
| `useAddSubscription` | use-subscriptions.ts | add mutation |
| `useUpdateSubscription` | use-subscriptions.ts | update mutation |
| `useDeleteSubscription` | use-subscriptions.ts | delete mutation (+ related transactions) |
| `useToggleSubscription` | use-subscriptions.ts | pause/resume mutation |
| `useSettings` | use-settings.ts | currency + userName + update functions |
| `useCurrency` | use-currency.ts | `{ currency, format }` for formatting amounts |
| `useDataStats` | use-stats.ts | transaction/category/source counts |

### query key management

all query keys are centralized in `lib/constants.ts` under `QUERY_KEYS`. hooks handle invalidation internally — screens don't touch query keys.

---

## features

### multi-currency support

currency setting stored in sqlite `settings` table. supported currencies:

| code | symbol | locale |
|---|---|---|
| INR | ₹ | en-IN |
| USD | $ | en-US |
| GBP | £ | en-GB |
| EUR | € | de-DE |

change currency in settings → preferences. all amounts across the app update immediately.

### monthly budgets

set per-category budget limits in profile → monthly budgets. home screen category bars change color based on spend vs budget:

| spend ratio | bar color | constant |
|---|---|---|
| no budget set | purple | `COLORS.PRIMARY` |
| under 75% | purple | `COLORS.PRIMARY` |
| 75-99% | orange | `COLORS.WARNING` |
| 100%+ | red | `COLORS.DANGER` |

adding a transaction that exceeds or approaches (90%) a budget triggers a warning toast.

### month vs last month comparison

home screen shows spending change compared to previous month ("↑ 12% vs last month" in red, "↓ 8%" in green). hidden when no previous month data exists.

### subscriptions

recurring expenses (Netflix, Spotify, etc.) managed via profile → subscriptions.

- each subscription has a name, amount, billing day (1-31), category, and source
- on app launch, `processSubscriptions()` auto-creates transactions for active subscriptions due this month
- handles end-of-month edge cases (billing day 31 → uses last day of month)
- subscriptions can be paused/resumed via toggle
- transactions created from subscriptions show a "SUB" badge
- home screen shows total active subscription cost with link to subscriptions screen
- add screen has a subscription switch — when on, shows subscription form with day picker
- editing a subscription: name, amount, category, source are editable; billing day is read-only (delete and recreate to change)
- deleting a subscription removes all its related transactions
- subscription transactions have their type toggle locked to expense in the edit screen

### swipe to delete

history screen supports swipe-to-delete with a 5-second undo toast. threshold is 70% of screen width.

---

## commands

```bash
pnpm start         # start expo dev server
pnpm ios           # run on ios simulator
pnpm lint          # biome check
pnpm lint:fix      # biome check + auto-fix
pnpm typecheck     # tsc --noEmit
pnpm quality       # lint + typecheck
```

---

## phase 2 roadmap

- **gmail API integration** — read axis bank transaction emails, regex parse amount + merchant + date
- **bun backend** — lightweight server to handle gmail oauth + email fetching
- **sync on app open** — hit backend on launch, fetch emails since `last_synced_at`, insert new transactions
- **railway deployment** — containerised bun backend
- **share sheet + OCR** — share a payment screenshot to the app, OCR extracts amount and prefills form

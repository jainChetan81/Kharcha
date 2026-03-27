# kharcha

personal expense tracking app for ios. built with expo, react native, and local-first sqlite storage.

---

## table of contents

- [tech stack](#tech-stack)
- [project structure](#project-structure)
- [design system](#design-system)
- [screens & navigation](#screens--navigation)
- [database](#database)
- [reusable components](#reusable-components)
- [utilities](#utilities)
- [state management](#state-management)
- [forms & validation](#forms--validation)
- [linting & formatting](#linting--formatting)
- [git hooks](#git-hooks)
- [ci/cd](#cicd)
- [deployment](#deployment)
- [claude code commands](#claude-code-commands)
- [phase 2 roadmap](#phase-2-roadmap)

---

## tech stack

| package | purpose |
|---|---|
| expo (sdk 55) | managed react native runtime |
| expo-router | file-based navigation |
| nativewind v4 | tailwind css for react native |
| react-native-reusables | shadcn-style ui primitives |
| @rn-primitives/* | headless primitives for rn-reusables |
| lucide-react-native | monochrome icons |
| @tanstack/react-query | async data fetching + caching |
| @tanstack/react-form | form state management |
| zustand | global ui state (planned) |
| expo-sqlite | local sqlite database |
| zod | schema validation (planned) |
| date-fns | date formatting and manipulation |
| biome | linting + formatting (replaces eslint + prettier) |
| lefthook | git hooks |
| eas | expo build + OTA updates (planned) |

---

## project structure

```
kharcha/
├── app/                        # screens (expo-router file-based)
│   ├── _layout.tsx             # root layout, QueryClientProvider, initDB
│   ├── index.tsx               # home screen
│   ├── add.tsx                 # add transaction screen
│   ├── history.tsx             # transactions list screen (planned)
│   └── settings.tsx            # settings screen (planned)
├── components/
│   └── ui/                     # rn-reusables components
│       ├── button.tsx
│       ├── card.tsx
│       ├── icon.tsx
│       ├── input.tsx
│       ├── native-only-animated-view.tsx
│       ├── select.tsx
│       └── text.tsx
├── lib/
│   ├── db/
│   │   └── index.ts            # db init, schema, seeds, queries, types
│   └── utils.ts                # cn(), isIOS, isAndroid, isWeb
├── .github/
│   └── workflows/
│       └── ci.yml
├── global.css                  # tailwind base imports
├── tailwind.config.js          # design tokens + nativewind preset
├── metro.config.js
├── babel.config.js
├── biome.json
├── lefthook.yml
├── CLAUDE.md
└── README.md
```

---

## design system

### colour tokens

all colours are defined in `tailwind.config.js` as semantic tokens. use the tailwind class names, not raw hex values.

| token | hex | tailwind class | usage |
|---|---|---|---|
| background | `#0a0a0a` | `bg-background` | all screen backgrounds |
| card | `#1a1a1a` | `bg-card` | cards, tab bar, inputs |
| border | `#2a2a2a` | `border-border` | card borders, dividers |
| foreground | `#f0f0f0` | `text-foreground` | headings, primary content |
| muted foreground | `#888888` | `text-muted-foreground` | subtitles, metadata, placeholders |
| primary (accent) | `#7c3aed` | `bg-primary` / `text-primary` | cta buttons, active tab, FAB |
| positive | `#22c55e` | `text-positive` | income, success states |
| negative | `#ef4444` | `text-negative` | expenses, error states |

### nativewind usage

use semantic tailwind classes for all styling. no inline styles unless required for dynamic values (e.g., platform padding).

```tsx
// correct — semantic tokens
<View className="flex-1 bg-background px-4 py-6">
  <Text className="text-foreground text-xl font-bold">kharcha</Text>
  <Text className="text-muted-foreground text-sm">subtitle</Text>
</View>

// avoid — raw hex or inline styles
<View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
```

### typography scale

| class | usage |
|---|---|
| `text-4xl font-extrabold` | large balance display |
| `text-lg font-bold` | screen titles |
| `text-sm font-semibold` | section headers |
| `text-sm` | body, labels |
| `text-xs` | timestamps, tags, metadata |
| `text-[11px]` | tab bar labels |

### spacing

follow 4px base grid. use tailwind spacing: `p-4` (16px), `p-6` (24px), `gap-3` (12px), `gap-4` (16px).

### border radius

| class | usage |
|---|---|
| `rounded-xl` | inputs |
| `rounded-2xl` | cards |
| `rounded-full` | avatar, pills, fab button |

### icons

use lucide-react-native via the `Icon` component wrapper (`components/ui/icon.tsx`). icons inherit colour from `className`.

```tsx
import { Icon } from "@/components/ui/icon";
import { House } from "lucide-react-native";

<Icon as={House} className="size-5 text-primary" />
```

---

## screens & navigation

### bottom tab navigation

3 tabs + centre FAB button. tabs use lucide icons.

| tab | icon | file | description |
|---|---|---|---|
| home | `House` | `app/index.tsx` | monthly summary + recent transactions |
| add | `Plus` (FAB) | `app/add.tsx` | pushes to add screen |
| history | `Clock` | `app/history.tsx` | full transaction list (planned) |
| settings | `Settings` | `app/settings.tsx` | manage categories and sources (planned) |

the FAB is a 60x60 purple circle (`bg-primary`) centred in the tab bar via absolute positioning. active tab uses `text-primary`, inactive uses `text-muted-foreground`.

### screen specs

**home (`app/index.tsx`)**
- header: "Hello, Chetan" + current month/year + avatar
- balance card: total balance (income - expenses) in `bg-card` with `border-border`
- summary cards: income (green text) + spent (red text) side by side, `bg-card`
- recent transactions: last 20, grouped by date (today, yesterday, date)
- each transaction: category initial, merchant name, category + source, amount
- data: tanstack query fetching from sqlite

**add transaction (`app/add.tsx`)**
- type toggle: expense (red tint) / income (green tint)
- fields: amount (numeric), merchant (text), category (chip picker), source (chip picker), date (text, defaults to today), note (multiline)
- validation: amount > 0, category required, source required, date required (YYYY-MM-DD)
- on submit: insert into transactions table, invalidate queries, navigate back
- error handling: Alert on failure
- form: tanstack form with onSubmit validators

**history (`app/history.tsx`)** — planned
- full transaction list, scrollable
- filter by category, source, date range
- grouped by date

**settings (`app/settings.tsx`)** — planned
- manage categories: list + add new + delete (cannot delete defaults)
- manage sources: list + add new + delete (cannot delete defaults)

---

## database

### schema

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'expense',  -- 'income' | 'expense'
  amount REAL NOT NULL,
  merchant TEXT,
  category_id INTEGER REFERENCES categories(id),
  source_id INTEGER REFERENCES sources(id),
  date TEXT NOT NULL,       -- ISO 8601 string (YYYY-MM-DD)
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### migrations

the `type` column on transactions was added post-initial schema. `initDB()` checks for it via `PRAGMA table_info` and runs `ALTER TABLE` if missing.

### default seeds

**categories:** food, transport, shopping, utilities, entertainment, health, salary, freelance, other

**sources:** cash, upi, credit card, debit card

seeds only run once on first app launch (checks if tables are empty before inserting).

### types and queries (`lib/db/index.ts`)

all types and query functions live in a single file:

```ts
// types
export type Category = { id: number; name: string; is_default: number };
export type Source = { id: number; name: string; is_default: number };
export type TransactionRow = { id, type, amount, merchant, category_id, source_id, date, note, created_at, category_name, source_name };
export type MonthlySummary = { total_income: number; total_expenses: number };

// queries
export function getRecentTransactions(limit = 20)   // JOIN with categories + sources
export function getMonthlySummary(yearMonth: string) // aggregate income/expenses
export function insertTransaction(params)            // insert row
```

---

## reusable components

### rn-reusables components (`components/ui/`)

installed via `pnpm dlx @react-native-reusables/cli@latest add <component>`.

| component | file | status |
|---|---|---|
| `Text` | text.tsx | active — typography with variants + TextClassContext |
| `Button` | button.tsx | active — pressable with CVA variants |
| `Input` | input.tsx | active — styled TextInput wrapper |
| `Icon` | icon.tsx | active — lucide icon wrapper with cssInterop |
| `Card` | card.tsx | available — card + header/content/footer |
| `Select` | select.tsx | available — rn-primitives dropdown |
| `NativeOnlyAnimatedView` | native-only-animated-view.tsx | internal — used by select |

---

## utilities

### `lib/utils.ts`

```ts
export function cn(...inputs: ClassValue[])  // clsx + tailwind-merge
export const isIOS: boolean
export const isAndroid: boolean
export const isWeb: boolean
```

---

## state management

### tanstack query

used for all sqlite data fetching. queries are called in screen files.

```ts
const { data: transactions } = useQuery({
  queryKey: ["transactions"],
  queryFn: () => getRecentTransactions(20),
});
```

invalidate queries after mutations:

```ts
await queryClient.invalidateQueries({ queryKey: ["transactions"] });
await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
```

### tanstack query devtools

`@dev-plugins/react-query` is installed and wired up in `_layout.tsx` (dev only). access via expo dev tools (shift+m in terminal).

### zustand — planned

for ui-only global state (active filters, selected date range, etc.). not for db data.

---

## forms & validation

all forms use tanstack form with inline onSubmit validators.

```tsx
const form = useForm({
  defaultValues: { amount: "", merchant: "", categoryId: null, ... },
  onSubmit: async ({ value }) => {
    await insertTransaction({ ... });
    router.back();
  },
});

<form.Field name="amount" validators={{
  onSubmit: ({ value }) => {
    if (Number(value) <= 0) return "Amount must be greater than 0";
    return undefined;
  },
}}>
  {(field) => <Input value={field.state.value} onChangeText={field.handleChange} />}
</form.Field>
```

zod schemas for form-level validation are planned.

---

## linting & formatting

biome handles both linting and formatting. no eslint, no prettier.

### config (`biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.9/schema.json",
  "files": {
    "ignoreUnknown": true,
    "includes": ["app/**", "components/**", "lib/**"]
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

### commands

```bash
pnpm lint          # check only
pnpm lint:fix      # check + auto-fix
pnpm format        # format only (biome format --write)
pnpm typecheck     # tsc --noEmit
pnpm quality       # lint + typecheck
```

---

## git hooks

lefthook runs biome on staged files before every commit.

### config (`lefthook.yml`)

```yaml
pre-commit:
  commands:
    biome:
      glob: "*.{js,ts,jsx,tsx}"
      run: pnpm biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
      stage_fixed: true
```

install hooks after cloning:

```bash
pnpm dlx lefthook install
```

---

## ci/cd

github actions runs on every push and PR to main/master.

### pipeline (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck
```

---

## deployment

kharcha is a personal ios app. no public app store listing. distribution via testflight.

### prerequisites

- expo account
- apple developer account
- eas cli: `pnpm add -g eas-cli`
- login: `eas login`

### eas setup (one time)

```bash
eas init
eas build:configure
```

### build commands

```bash
pnpm build:ios          # production build -> testflight
pnpm build:ios:preview  # preview build for testing
pnpm submit:ios         # submit to testflight
pnpm update             # OTA js update (no review needed)
```

### eas.json (add to root)

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "ios": { "buildConfiguration": "Release" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your@apple.id", "ascAppId": "your-app-id" }
    }
  }
}
```

### OTA updates

for js-only changes (no native module changes), push updates without going through testflight review:

```bash
pnpm update
```

---

## claude code commands

| command | description |
|---|---|
| `/commit` | stage all + create conventional commit message |
| `/quality` | run biome + tsc, report errors |
| `/new-screen [name]` | scaffold a new expo-router screen |
| `/review` | review uncommitted changes for issues |

**note:** claude code will never run pnpm commands directly. it will tell you which command to run and wait for your confirmation.

---

## phase 2 roadmap

- **gmail API integration** — read axis bank transaction emails, regex parse amount + merchant + date
- **bun backend** — lightweight server to handle gmail oauth + email fetching
- **sync on app open** — hit backend on launch, fetch emails since `last_synced_at`, insert new transactions
- **railway deployment** — containerised bun backend
- **share sheet + OCR** — share a payment screenshot to the app, OCR extracts amount and prefills form (requires expo dev client)

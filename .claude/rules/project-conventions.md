# Project Conventions - Kharcha

## Architecture
- `app/` — screens (expo-router file-based routing)
- `components/ui/` — reusable UI primitives (Button, Text, Input, ChipPicker, BottomSheet, etc.)
- `components/` — feature components (TransactionForm, SubscriptionForm, TransactionItem)
- `hooks/` — TanStack Query hooks wrapping db functions
- `lib/db/` — SQLite via drizzle-orm (connection, schema, typed modules)
- `lib/gmail/` — Gmail OAuth + bank email parsers
- `lib/` — shared utilities (constants, format, toast, utils)

## State Management
- TanStack Query for all server/db state (query keys in `lib/constants.ts`)
- Local `useState` for UI state (modals, form drafts, filters)
- No global state store — queries handle caching and invalidation

## Styling
- NativeWind classes only, no inline `style` prop (exception: native components like DateTimePicker)
- Use `cn()` from `@/lib/utils` for conditional classes
- Color constants in `lib/constants.ts` (`COLORS.*`) for non-className contexts (Switch trackColor, etc.)
- Use semantic color classes: `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-primary`

## Naming Conventions
- Components: PascalCase (e.g., `ScreenHeader.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useTransactions.ts`)
- DB functions: camelCase (e.g., `getTransactionsPaginated`)
- Constants: UPPER_SNAKE_CASE (e.g., `QUERY_KEYS`, `TRANSACTION_TYPE`)

## Data Layer
- All db modules import `db` from `./connection` (single Drizzle instance)
- Types live in `lib/db/types.ts` — single source of truth
- Hooks re-export what screens need; screens never import from `lib/db/` directly

## Performance
- Lists use `@shopify/flash-list` with `estimatedItemSize`
- `getDataStats()` uses `Promise.all` for parallel queries — follow this pattern
- Subscription processing batch-fetches to avoid N+1 queries

## Quality
- `react-doctor` enforces React/RN anti-patterns (state & effects, perf, a11y); config in `react-doctor.config.json`. Pre-push runs `react-doctor:diff` against `main` and blocks on errors.

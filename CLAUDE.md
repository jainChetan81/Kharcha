# kharcha

personal expense tracking app for ios.

## stack

- expo (managed) + expo-router (file-based routing)
- nativewind v4 + react-native-reusables (tailwind-style ui)
- tanstack query + tanstack form
- drizzle-orm + expo-sqlite (local storage)
- date-fns (date handling)
- biome (lint + format)
- lefthook (git hooks)

## commands

- `pnpm start` — start expo dev server
- `pnpm ios` — run on ios simulator
- `pnpm lint` — biome lint + format check
- `pnpm lint:fix` — biome lint + format fix
- `pnpm typecheck` — tsc --noEmit
- `pnpm quality` — lint + typecheck
- `pnpm dead-code` — knip dead code check
- `pnpm react-doctor` — full repo react/rn anti-pattern scan (offline)
- `pnpm react-doctor:diff` — scan only files changed vs main (used by pre-push)

## structure

- `app/` — screens (expo-router file-based)
- `components/ui/` — rn-reusables components
- `components/` — shared components
- `hooks/` — tanstack query hooks wrapping db functions
- `lib/db/` — drizzle-orm schema, connection, typed modules
- `lib/gmail/` — gmail oauth + bank email parsers
- `lib/` — shared utilities (constants, format, toast, utils)

## conventions

- nativewind classes only, no inline `style` prop. use `cn()` from `@/lib/utils` for conditional/dynamic classes. only exception: third-party native components (e.g. DateTimePicker) that don't support className
- no any types
- functional components only
- tanstack query for all data fetching
- tanstack form for all forms
- never run pnpm commands directly. instead tell the user which command to run and wait for them to confirm the result before proceeding.

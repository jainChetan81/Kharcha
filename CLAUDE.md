# kharcha

personal expense tracking app for ios.

## stack
- expo (managed) + expo-router (file-based routing)
- nativewind v4 + react-native-reusables (tailwind-style ui)
- tanstack query + tanstack form
- zustand (ui state)
- expo-sqlite (local storage)
- zod (validation)
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

## structure
- `app/` — screens (expo-router file-based)
- `components/ui/` — rn-reusables components
- `components/` — shared components
- `lib/db/` — sqlite setup and queries
- `lib/stores/` — zustand stores
- `lib/types/` — typescript types

## conventions
- nativewind classes only, no inline styles
- zod for all form validation
- no any types
- functional components only
- tanstack query for all data fetching
- tanstack form for all forms
- never run pnpm commands directly. instead tell the user which command to run and wait for them to confirm the result before proceeding.

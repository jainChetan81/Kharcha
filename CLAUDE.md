# kharcha

personal expense tracking app for ios + android (react native / expo).

## stack

- expo + expo-router (file-based routing). prebuild/CNG workflow — `ios/`/`android/` are generated & gitignored; edit `app.json` or `plugins/`, never the native dirs directly
- nativewind v4 + react-native-reusables (tailwind-style ui)
- tanstack query + tanstack form
- drizzle-orm + expo-sqlite (local storage)
- date-fns (date handling)
- gemini 2.5 flash — on-device parsing of sms / email / notifications into transactions
- firebase (analytics, crashlytics, perf) + google sign-in + cloud backup (google drive / icloud)
- zod (validation), fuse.js (fuzzy merchant match), react-native-gifted-charts (insights)
- eas (build + ota updates)
- biome (lint + format)
- lefthook (git hooks)

## commands

- `pnpm start` — start expo dev server
- `pnpm ios` — run on ios simulator
- `pnpm android` — run on android emulator/device
- `pnpm drizzle:generate` — generate sql migration after editing `lib/db/schema.ts`
- `pnpm drizzle:studio` — open drizzle studio
- `pnpm doctor` — expo-doctor dependency/config check
- `pnpm lint` — biome lint + format check
- `pnpm lint:fix` — biome lint + format fix
- `pnpm typecheck` — tsc --noEmit
- `pnpm quality` — lint + typecheck
- `pnpm local-ci` — full local CI gate (frozen install + quality + audit + dead-code)
- `pnpm dead-code` — knip dead code check
- `pnpm react-doctor:scan` — full repo react/rn anti-pattern scan (offline)
- `pnpm react-doctor:diff` — scan only files changed vs main (used by pre-push)
- `pnpm build:android` / `pnpm update:production` — eas production build / ota update (see docs/RELEASE.md)

## structure

- `app/` — screens (expo-router file-based)
- `components/ui/` — rn-reusables components
- `components/` — shared components
- `hooks/` — tanstack query hooks wrapping db functions
- `lib/db/` — drizzle-orm schema, connection, typed modules
- `lib/gmail/` — gmail oauth + bank email parsers
- `lib/parsers/` — per-bank sms regex parsers (local fast-path for the AI-paste sheet); `lib/gemini/` — on-device gemini client
- `lib/firebase/` — analytics/crashlytics/logging; `lib/cloud-backup/` — gdrive + icloud; `lib/export/` — csv/data export
- `lib/` — shared utilities (constants, format, toast, utils)
- `widgets/` — ios home-screen widget (swift)
- `docs/` — architecture notes (ARCHITECTURE, DRIZZLE, GMAIL_SYNC, RELEASE, CI, ANDROID_DEBUG)

## environment

- copy `.env.example` → `.env.local`: google oauth client ids + `EXPO_PUBLIC_GEMINI_API_KEY` (ai parsing degrades gracefully if the key is absent). firebase needs `google-services.json` (see `.example`).
- gotcha: expo inlines `EXPO_PUBLIC_*` at build time via babel — only literal `process.env.EXPO_PUBLIC_FOO` works; dynamic `process.env[key]` is `undefined` in prod. register new vars in `lib/env.ts`.

## conventions

- nativewind classes only, no inline `style` prop. use `cn()` from `@/lib/utils` for conditional/dynamic classes. only exception: third-party native components (e.g. DateTimePicker) that don't support className
- no any types
- functional components only
- tanstack query for all data fetching
- tanstack form for all forms
- never run pnpm commands directly. instead tell the user which command to run and wait for them to confirm the result before proceeding.
- schema changes: edit `lib/db/schema.ts`, run `pnpm drizzle:generate`, AND keep the inline `CREATE TABLE IF NOT EXISTS` in `initDB()` in sync — both run on every launch (fresh-install safety net + incremental migrations). see docs/DRIZZLE.md.

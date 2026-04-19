---
allowed-tools: Bash(pnpm biome check:*), Bash(pnpm tsc:*), Bash(git diff:*)
description: run quality checks and review uncommitted changes
---

## step 1: quality checks

run these in sequence and report results:

1. `pnpm lint` — biome lint and format check
2. `pnpm typecheck` — typescript type check

if biome has fixable issues, ask whether to auto-fix with `pnpm lint:fix`

## step 2: code review

!`git diff HEAD`

review the diff for:
1. type errors or missing types
2. any `any` usage
3. nativewind class issues (inline styles, hardcoded colors)
4. missing zod validation on forms
5. logic errors
6. unused imports or dead code
7. duplicate code — near-identical JSX blocks, helper functions, or patterns repeated across files that should be extracted
8. loose strings — hardcoded values that should live in `lib/constants.ts` (route strings bypassing `SCREENS.*`, query keys bypassing `QUERY_KEYS.*`, config keys bypassing `CONFIG_KEYS.*`, repeated toast/error copy)
9. firebase analytics wiring — new user actions should call `logEvent()` from `@/lib/firebase`, new screens should log a screen view, failure paths should forward errors to crashlytics via `logFirebaseError()`
10. common components — locally-defined row/card/badge/empty-state/loading widgets that match patterns in `components/ui/` or that are duplicated inline across screens should be extracted to `components/ui/` or `components/`

be specific about file and line. summarise total errors and warnings.

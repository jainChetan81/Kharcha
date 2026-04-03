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

be specific about file and line. summarise total errors and warnings.

---
allowed-tools: Bash(pnpm biome check:*), Bash(pnpm tsc:*)
description: run biome lint+format check and typescript type check
---

run these in sequence and report results:

1. `pnpm lint` — lint and format check
2. `pnpm typecheck` — type check

if biome has fixable issues, ask whether to auto-fix with `pnpm lint:fix`

summarise total errors and warnings.

---
allowed-tools: Bash(git diff:*)
description: review current uncommitted changes
---

## current changes
!`git diff HEAD`

review for:
1. type errors or missing types
2. any `any` usage
3. nativewind class issues
4. missing zod validation on forms
5. logic errors

be specific about file and line.

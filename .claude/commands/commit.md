---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*)
description: stage all changes and create a conventional commit message
---

## context
- git status: !`git status`
- staged diff: !`git diff --cached`
- unstaged diff: !`git diff`

## task
1. review all changes
2. stage everything with `git add .`
3. write a concise conventional commit message (feat/fix/chore/refactor/style)
4. commit with that message

keep the message under 72 characters.

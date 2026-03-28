Generate a commit for the current changes.

## Instructions

1. Run `git status` to see modified files (never use -uall flag)
2. Run `git diff --staged` to see staged changes, or `git diff` if nothing is staged
3. Analyze the changes and generate a concise ONE-LINE commit message that:
   - Starts with a verb (add, fix, update, remove, refactor, etc.)
   - Is under 72 characters
   - Describes WHAT changed, not HOW
   - Uses lowercase (except for proper nouns)
4. Stage all relevant files with `git add <specific-files>` (avoid `git add .`)
5. Show user commit message only, do NOT run git commit

## Examples of good commit messages

- "add visibility icons to sections dropdown"
- "fix tooltip padding in TooltipPortal component"
- "update access control options with descriptions"
- "remove unused Dropdown component from LeftNav"
- "refactor getAccessControlLabel to use optional chaining"

## Important

- Do NOT push to remote
- Do NOT amend previous commits unless explicitly asked
- Do NOT commit .env files or credentials
- Keep the message to ONE/TWO line (the description part)

# delegate-to-kimi

a claude code skill for delegating bounded coding tasks to `kimi`
(`~/.kimi-code/bin/kimi`, moonshot ai's coding cli) as a background execution
agent, with claude acting as manager: claude plans, kimi codes, claude
verifies.

## where things live

- **the skill itself is no longer canonical here.** the skill isn't
  kharcha-specific, so as of 2026-07-15 the real file lives at
  `~/Desktop/Claude/ai-setup/delegate-to-kimi/SKILL.md`. this repo's
  `.claude/skills/delegate-to-kimi` is a symlink pointing there, and the
  global `~/.claude/skills/delegate-to-kimi` symlink also points there —
  edit the ai-setup copy, both symlinks pick it up automatically.
- **this folder:** background on why the skill looks the way it does —
  useful if you're revising it later and want to know what's already been
  tried and rejected, so you don't re-litigate settled trade-offs by accident.
  - `DESIGN_HISTORY.md` — the full evolution across every review round
  - `kimi-review.md` — kimi's own review of the skill from the executor's
    seat, and claude's reply reconciling it
- **`memory/PROJECT_MEMORY.md`** (repo root) — a human-readable mirror of
  what claude has learned about this project across sessions, so it's
  visible here instead of locked inside claude's own private memory

## how it's actually run

1. claude writes a plan (what exists, exact scratch db/fixture source, exact
   `--add-dir` scope, explicit file paths, order of operations, how it'll be
   verified) to `/tmp/kimi-delegation-tmp/<task>/plan.md`, and posts it in
   chat before launching anything.
2. claude launches kimi non-interactively in the background:
   `kimi -p "read the plan at ... and carry it out exactly." --add-dir <scoped-dir> --output-format text > /tmp/kimi-delegation-tmp/<task>/run.log 2>&1 &`
3. claude polls the log every 10s, only narrating in chat when something
   actually changes.
4. kimi signals how it ended with a `KIMI_STATUS: DONE / BLOCKED - <reason> /
   FAILED - <reason>` sentinel as the last line of the log. anything other
   than `DONE` (including no sentinel at all, meaning it crashed) stops
   there — no retries, no auto-recovery, chetan decides what's next.
5. on `DONE`, claude verifies independently anyway: typecheck/lint, direct
   db query against the scratch copy (constraints, not just row counts),
   full `git diff` read, scan for unexpected changes, log grep for anything
   sensitive, orphaned-process check. kimi's own report is never sufficient
   on its own.
6. cleanup: everything for a run lives under
   `/tmp/kimi-delegation-tmp/<task>/`. claude asks before deleting it.

the full detail (exact rules, the FDA/launchd rare-case path, when not to
use this at all) is in the skill file itself — this is just the map.

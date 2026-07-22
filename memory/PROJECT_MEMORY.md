# project memory

a human-readable mirror of what claude has learned about this project across
sessions, so it's visible here rather than locked inside claude's own
private, cross-session memory. this file is a snapshot, not the live source —
claude's internal memory is what actually shapes its behavior turn to turn;
this is here so chetan (or anyone else working in this repo) can see it
without asking.

## delegate-to-kimi skill

the `delegate-to-kimi` claude code skill governs delegating bounded coding
tasks to kimi (`~/.kimi-code/bin/kimi`, moonshot ai's coding cli) as a
background execution agent — claude plans, kimi executes, claude verifies
independently. kimi's own "done" report is never trusted alone.

- **canonical file:** `~/Desktop/Claude/ai-setup/delegate-to-kimi/SKILL.md`
  (moved out of this repo in commit e8c6ced). this repo's
  `.claude/skills/delegate-to-kimi` is a symlink to that directory.
- **global availability:** also symlinked to `~/.claude/skills/delegate-to-kimi`
  on chetan's mac, so it's usable from any project, not just kharcha. ai-setup
  is the single source of truth; the symlinks just expose it elsewhere.
  re-run the symlink on any other machine:
  `ln -s ~/Desktop/Claude/ai-setup/delegate-to-kimi ~/.claude/skills/delegate-to-kimi`
- **docs:** `docs/delegate-to-kimi/README.md` (overview + how a run actually
  goes), `docs/delegate-to-kimi/DESIGN_HISTORY.md` (all five review rounds
  and what each one changed or deliberately didn't), and `docs/delegate-to-kimi/
  kimi-review.md` (kimi's own review of the skill from the executor's seat,
  verbatim, plus claude's reply).

## skill-writing style: brevity as a safety property

when revising a skill (or similar prescriptive doc) for this project, cut
restated facts rather than let them accumulate across rounds. the same idea
stated in three different sections (because sections were written at
different times, not because each repetition guards a distinct failure) is
bloat and should get merged to one strong statement. repetition is only
worth keeping when it corresponds to a genuinely distinct incident — e.g. a
cleanup-verification step repeated because it silently failed once in real
use. this was validated across multiple review rounds on the delegate-to-kimi
skill (128 → 67 → 115 → 106 → 93 lines) — an unfollowed long document
protects less than a followed short one.

## pal connector (multi-model review)

chetan has a self-hosted MCP connector, "pal," on his mac mini
(`mini.bullhead-mine.ts.net`, tailscale), used for genuine second opinions
from gemini/gpt/grok via openrouter before delivering research or
recommendations — governed by the `pal-review` skill. only openrouter is
configured (no direct gemini/openai/xai keys); 27 models available, auto
model-selection.

failure mode worth knowing: `listmodels` can succeed (it's just static
server config, no external call) while `chat`/`consensus` fail (these need an
actual openrouter round-trip) — so `listmodels` working is not proof the
whole connector is healthy. `google/gemini-3-pro-preview` returned a 404 (no
endpoint) during this project's use; `google/gemini-2.5-pro` worked reliably
instead.

## sandbox git quirk (cowork sessions specifically)

running unscoped `git status`/`git log` against this repo's mount from a
cowork sandbox session has crashed with bus errors on unrelated files.
scope git commands to a specific path
(`git status -- path`, `git add path`) rather than repo-wide. a crash can
leave a stale `.git/index.lock` that the sandbox can't remove itself
("operation not permitted") — if that happens, the fix is running the same
`rm -f .git/index.lock && git add ... && git commit ...` commands directly in
a real terminal, which has worked cleanly every time it's been tried.

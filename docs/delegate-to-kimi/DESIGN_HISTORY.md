# design history

how `delegate-to-kimi` got to its current shape. kept so a future revision
doesn't re-litigate a trade-off that was already argued out and settled.

## origin

chetan had been delegating implementation work to kimi manually for a while:
write a detailed brief to a file, launch kimi non-interactively in the
background (`kimi -p ... --add-dir ... &`), poll-tail the log narrating
progress, then independently re-verify everything rather than trust kimi's
own "done" report — a discipline that had already caught three real bugs
kimi's self-report missed (a fingerprint-uniqueness bug, a test-isolation bug
where kimi wrote to the production db during a "test," and a stray launchd
agent left running after kimi's usage quota cut it off mid-cleanup). the ask
was to turn that practice into a reusable claude code skill.

## round 1 — pal-review on the original workflow (128 lines, 5 hard rules)

reviewed by google/gemini-2.5-pro (for) and openai/gpt-5.2 (against) via the
pal connector. both agreed the brief-then-verify loop was sound and that
independent verification was correctly the load-bearing part. gpt-5.2 flagged
two structural problems the original practice hadn't fully guarded against:
production-db exposure (kimi could reach the real kharcha db) and the FDA/
launchd workaround being a genuine privilege-escalation pattern with only
best-effort cleanup. those became hard rules: kimi only ever touches a
scratch copy, and the FDA/launchd path requires human review before
execution plus a negative-assertion cleanup check
(`launchctl list | grep <prefix>` must return nothing) rather than trusting
kimi's own cleanup step.

## round 2 — consolidation (67 lines)

chetan flagged the 128-line version as too much ceremony to actually follow
every time. pal-reviewed again: gemini-2.5-pro argued brevity is itself a
safety feature, since an unfollowed 5-rule document protects less than a
followed 2-rule one; gpt-5.2 agreed with the direction but pushed back on two
items being dropped silently — crash/quota-cutoff handling and
no-overlapping-runs — since both existed because of real prior incidents, not
hypothetical ones. reconciled down to two rules (sandbox-only,
mandatory-verification) plus a short workflow, with the incident-driven items
kept as explicit one-liners rather than folded into vague prose.

## round 3 — a plan-review gate (115 lines)

chetan asked for visibility into "the discussion between the two ais" and for
logs to be surfaced live rather than narrated-then-discarded. this added a
two-call structure: kimi proposes a plan only, claude reviews it against the
two rules and either approves, sends back one revision, or stops and asks —
never an open-ended negotiation — before a second call lets kimi execute.

## round 4 — claude plans, kimi only executes (86–106 lines across a few passes)

chetan drew an analogy to a "claude code as harness, swappable model
underneath" setup he'd seen elsewhere and clarified the intended shape: kimi
should be a pure executor, not a co-planner. the plan-proposal/critique loop
was removed entirely — claude authors the plan solo and posts it in chat
before launching kimi, kimi's only job is carrying it out. this also
tightened operational details chetan asked for directly: a 10-second
heartbeat poll that only surfaces to chat on meaningful events (not spam
every poll), zero automatic retries on crash or quota cutoff (stop and report,
chetan decides what's next), logs and scratch fixtures consolidated under
`/tmp/kimi-delegation-tmp/<task>/` instead of scattered `/tmp` files, and a
cleanup step at the end that asks before deleting rather than assuming.

chetan then pal-reviewed this shape too (gemini-2.5-pro for, gpt-5.2 against)
specifically on mechanical soundness and bloat. findings: the "kimi doesn't
plan, claude does" fact and the `--add-dir` scope boundary were each being
stated three times across different sections — real redundancy, not
safety-motivated repetition like the FDA cleanup check. the session-id
logging line ("write claude's own session id to the log for remote ssh
reconnection") was flagged as an unverified, possibly unfulfillable
instruction rather than cut outright — hedged instead ("if a reliable
identifier is actually available... don't fabricate one"). pal's consensus
tool failed several times mid-review (mcp process up, model round-trips
failing); this was reported honestly rather than silently delivering an
unreviewed take, per this repo's own pal-review skill rules.

## round 5 — kimi reviews itself (93 lines)

chetan had kimi read the skill and review it from the executor's seat — the
one perspective none of the earlier rounds could actually supply. see
`kimi-review.md` for the full exchange. the concrete, load-bearing findings
that made it in:

- **plans must name exact file paths, not descriptions.** kimi pointed out
  it's an intent interpreter, not a mind reader — "the auth file" gets
  guessed at.
- **`--add-dir` must live entirely inside `/tmp/kimi-delegation-tmp/<task>/`.**
  one change that closed three separate problems kimi raised at once:
  scratch-source-vs-scope divergence, cross-directory reads (claude now
  copies needed context in rather than kimi reaching outside its scope), and
  build-artifact pollution (nothing kimi leaves behind can land outside the
  cleanup boundary, because there's no path for it to escape to).
- **stop-and-flag instead of guessing.** kimi's launch prompt now explicitly
  tells it to stop and log what blocked it rather than silently resolving an
  ambiguity or a contradiction between plan steps.
- **a completion artifact.** kimi now writes `result.md` (files touched,
  commands run, what failed) — not as a replacement for independent
  verification, which still checks every claim, but as a starting index
  instead of starting from nothing.
- **a status sentinel.** kimi proposed printing `KIMI_STATUS: DONE`,
  `BLOCKED - <reason>`, or `FAILED - <reason>` as the literal last line of the
  log, distinct from `result.md` merely existing — so claude's poll loop can
  tell a controlled stop from an actual crash with one `tail -n 1` instead of
  parsing prose. adopted as-is, echoed as the first line of `result.md` too
  for redundancy.

not adopted: the concern that `--add-dir` might not be a real CLI flag
(confirmed real by chetan directly); strict enforcement of the plan's stated
order of operations (kimi exercising implementation judgment is the point of
delegating to it rather than a script).

## a caught bug along the way

the skill's frontmatter `description` field originally included a literal
`<task>` placeholder ("delegate `<task>` to kimi"). skill descriptions get
surfaced wrapped in `<description>...</description>` tags, so an unescaped,
unclosed tag inside that value risked being read as markup rather than
literal text. fixed by dropping the placeholder rather than swapping bracket
styles.

## what's still open

no automated check exists between "claude writes the plan" and "kimi
executes it" beyond claude's own diligence — no second reviewer, no
self-check gate. that's a deliberate trade from round 4 (chetan asked for
the plan-critique loop removed), not an oversight, and is probably fine given
claude also runs the independent verification afterward. worth revisiting if
this skill ever gets used for something higher-stakes than a personal
finance side project.

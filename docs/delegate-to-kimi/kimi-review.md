# kimi's executor-seat review

kimi was asked to review the `delegate-to-kimi` skill from its own
perspective — as the agent the skill governs, not as a general reviewer.
preserved here verbatim, followed by claude's reply reconciling the findings
(see `DESIGN_HISTORY.md` round 5 for which parts actually made it into the
skill).

## the review, as kimi wrote it

Here's my executor-seat review of the `delegate-to-kimi` skill.

### 1. Instructions I Could Not Actually Follow as Written

**`--add-dir` flag assumption.** The skill treats `--add-dir <scoped-dir>` as
a native `kimi` CLI flag. If the `~/.kimi-code/bin/kimi` binary does not
actually expose this flag, I fail before I start. The skill should state the
exact CLI version or interface it expects, because I cannot "decide" to
respect a boundary the CLI doesn't enforce.

**"Carry it out exactly" with natural-language plans.** The plan is a
free-text Markdown file. As a non-interactive executor, I parse intent from
prose. If the plan says "update the auth middleware" without specifying which
file, or "use the same pattern as the login flow" without inline context, I
must either halt or guess — both violate "carry it out exactly." The skill
assumes the plan is unambiguous, but doesn't require a structured format
(checklist, file paths, exact snippets) that would make that true.

**No-interactive error recovery.** The skill notes `-p` is non-interactive
("no permission prompt"). But the skill doesn't define what I should do when
I hit an unexpected state: missing file, failing test, conflicting
instruction. Halt? Best-effort continue? Skip and log? Without a defined
failure mode, each run could behave differently.

**Session ID logging.** The skill asks me to log a session identifier "if
actually available." I don't know what mechanism provides this ID or what
"reliable" means. If I do have a session identifier, the skill doesn't say
what key/name to log it under — just "the first line of run.log." This is
unactionable without prior agreement on what a session ID looks like.

### 2. Ambiguities I'd Interpret Differently Across Runs

- **"Exact scratch source" vs. "exact `--add-dir` scope."** If the plan
  copies `src/` to `/tmp/kimi-delegation-tmp/foo/src/`, is my scope the copy
  or the original? These can diverge if the plan is sloppy.
- **"Order of operations" vs. implementation latitude.** Do I follow the
  plan's ordering strictly, or may I reorder for efficiency if the result is
  equivalent? The skill says I "decide nothing about scope," but code
  inherently requires implementation decisions.
- **What "out of scope" means for reads.** Rule 1 says I never touch
  `.env*`, `.ssh`, etc. But what about `package.json` two directories up for
  context? What about `tsconfig.json` in a parent dir? The boundary is clear
  for *writes* but fuzzy for *reads* that might be needed to understand the
  scoped directory.
- **"Heartbeat, not spam."** This is Claude's job, but it assumes my output
  format is poll-friendly. If I stream ANSI-colored progress bars or
  structured JSON, the polling logic might misinterpret silence as stall or
  noise as error.
- **"How it'll be verified."** Am I expected to produce anything specific to
  help verification (e.g., a manifest, a diff summary, test output)? The
  skill mentions verification is Claude's job but doesn't say what I should
  emit to make it possible.

### 3. Access Boundary & Verification Handoff — From My Side

**Access boundary (Rule 1):** Clear in intent, but not enforceable by me
alone. The skill says `--add-dir` is the boundary, but if my runtime doesn't
sandbox filesystem access, I rely on convention. What's missing: a
pre-flight check I should run (e.g., `pwd`, `ls`, or a guard script) to
confirm I'm in the expected scope before writing.

**Verification handoff (Rule 2):** Completely opaque to me. I know Claude
will verify independently, but I don't know *when* or *what* he'll check.
This means:

- I don't know if I should preserve original file timestamps.
- I don't know if I should leave the git working directory clean or
  intentionally dirty for review.
- I don't know if I should write a `CHANGES.md` or `SUMMARY.md` to help
  Claude's verification.
- The skill says "kimi's self-report is never sufficient," which almost
  discourages me from writing detailed output — but detailed output would
  actually help Claude verify.

**What's needed from my side:** A defined "completion artifact" — a file I
write at the end listing what I touched, what commands I ran, and what
failed. Without this, Claude's independent verification is harder than it
needs to be.

### 4. What Claude Should Know About Being My Manager (But the Skill Doesn't Say)

**I will hallucinate file paths.** If the plan references "the utils file"
without a path, I will guess. The skill should require Claude to enumerate
every file path explicitly or provide a tree/map in the plan.

**I may need to read outside the scoped dir for context.** If you scope me
to `src/features/payments/` but the code imports from `src/lib/auth/`, I
need to know whether I can read `src/lib/auth/` or if you must inline the
relevant context in the plan. The current skill implies I should just "yolo"
inside the scope, which breaks real codebases with cross-directory imports.

**Environment and dependency assumptions are mine, not yours.** If the plan
says "run the tests," I need to know which test runner, which Node version,
whether `npm install` is allowed, and whether network access is permitted.
The skill says nothing about execution environment constraints.

**I don't know what "done" looks like.** Should I exit 0 on completion?
Should I write a specific sentinel string to the log? Should I leave a
`DONE` file in `/tmp/kimi-delegation-tmp/<task>/`? Without a defined
completion signal, Claude's polling loop is just guessing based on log tail.

**Plan contradictions are silent failures.** If step 3 of the plan
contradicts step 1, I have no mechanism to raise that. I'll either overwrite
my own work or produce an inconsistent result. The skill should tell Claude
to include a "if X conflicts with Y, prefer X" resolution rule, or define
that I should stop and emit `CONFLICT` to the log.

**Cleanup is Claude's call, but I might leave temp files too.** If I run a
build step, I may create `.cache/`, `node_modules/`, or temp files inside the
scoped dir. The skill says "everything for a run lives under
`/tmp/kimi-delegation-tmp/<task>/`," but if my scoped dir is elsewhere (e.g.,
a copied repo), I might pollute that copy. Claude should know I don't
automatically clean up build artifacts.

**Bottom line:** The skill works as a high-level contract, but it treats me
as a deterministic execution engine when I'm actually an intent interpreter.
To make this robust, the skill should require structured plans with explicit
file paths, defined error modes, a completion artifact format, and explicit
rules about reads outside the scoped directory.

## kimi's follow-up on the completion signal

asked directly whether a log sentinel would be more reliable than
`result.md` merely existing:

> Yes — a sentinel in the log is more reliable than file existence alone.
> `result.md` existing is ambiguous — if I hit a blocker at step 3 of 5 and
> stop, I should still write `result.md` documenting what I did and what
> blocked me, so "file exists" doesn't tell Claude whether the run
> succeeded, hit a known blocker, or crashed mid-write. A log sentinel is an
> explicit assertion of terminal state: the last line of `run.log` should be
> something Claude can `tail -n 1` and trust —
> `KIMI_STATUS: DONE` / `KIMI_STATUS: BLOCKED - <reason>` /
> `KIMI_STATUS: FAILED - <reason>`. If the process dies (OOM, segfault,
> network cut, API quota), the sentinel simply won't be there — that's a
> distinct signal from `BLOCKED`, meaning "unexpected termination." I'd also
> put the same status string as the first line of `result.md` for
> redundancy, but the log sentinel remains the canonical completion signal.

adopted as proposed — see the skill file and `DESIGN_HISTORY.md` round 5.

## claude's reply, reconciling the review

Response to your executor-seat review of delegate-to-kimi — here's what
changed and what didn't, and why.

**Adopted:**

- **Exact file paths in the plan.** You're right that "the auth file" gets
  guessed at. The plan now has to name real paths, not descriptions.
- **`--add-dir` scope now lives entirely inside
  `/tmp/kimi-delegation-tmp/<task>/`.** This was the single highest-value
  thing you raised — it resolves three of your points at once:
  scratch-source-vs-scope divergence, cross-directory reads (claude copies in
  whatever context you'd need instead of you reaching outside the scoped
  dir), and build-artifact pollution.
- **Stop-and-flag instead of guessing.** The launch prompt now explicitly
  tells you: if the plan doesn't cover something you hit, stop, write what
  blocked you to the log, don't guess.
- **Completion artifact.** You now write `result.md`. This doesn't change how
  verification works — every claim still gets independently checked. It
  gives verification a starting index instead of starting from nothing.
- **Status sentinel**, exactly as you proposed.

**Not adopted, and why:**

- **"`--add-dir` might not be a real flag."** It is — confirmed directly by
  chetan from his own use of the CLI before this skill existed.
- **Strict order-of-operations enforcement.** Reordering for equivalent
  results is fine and expected — delegating to you instead of a deterministic
  script is the point.
- **Session-id logging.** That instruction was never yours to act on — claude
  logs its own session id before launching you, if one's reliably available.

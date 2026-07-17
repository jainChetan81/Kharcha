# kharcha v3 — status & delta, 2026-07-17

date: 2026-07-17. status: spec delta / progress checkpoint. does **not** replace
`docs/V3_SPEC.md` — that document remains the source of truth for architecture,
schema, and the phased plan. this document records what a same-day live audit
changed, confirmed, or invalidated about that plan, what code has already moved,
and what the concrete next steps are, in order. read `V3_SPEC.md` first; this is
the "as of today" annotation on top of it.

two repos are in play:
- `Kharcha` (this repo) — the Expo/React Native app. git repo, remote
  `jainChetan81/Kharcha`.
- `kharcha-mini` — the Mac Mini backend (Bun/TypeScript) that ingests iPhone SMS
  via iCloud-synced `chat.db`, parses bank alerts, and is the canonical data
  store. **has no git repository.** V3_SPEC.md phase 1 already flags "make the
  mini a git repo" as non-negotiable before further pipeline surgery; today's
  findings make that more urgent, not less — there is now uncommitted,
  unreviewable, unrevertable prompt/schema logic sitting in a bare directory
  that a `rm -rf` or a bad edit could destroy with no recovery path.

## problem statement

V3_SPEC.md proposed inverting the parsing pipeline (AI parses first, regex
validates/falls back) on the strength of two assumptions: that OpenRouter's
`google/gemini-3.5-flash` is cheap enough to run on every incoming SMS
("fractions of a cent"), and that the main blockers to a clean v3 rollout were
architectural (schema gaps, a missing `/parse` endpoint, three known app-side
bugs). Today's live audit against the mini's actual OpenRouter account tested
both assumptions against reality and found:

1. **the cost assumption was wrong.** `google/gemini-3.5-flash` on OpenRouter is
   a mandatory-reasoning model — `reasoning.max_tokens: 0` is rejected outright,
   and reasoning tokens bill at the completion rate. A trivial one-sentence SMS
   extraction measured at **~$0.12/call**, two orders of magnitude above what a
   non-reasoning-forced flash-tier model should cost for the same task. At
   20–40 SMS/day that is **~$72–144/month** for a personal expense tracker,
   not "fractions of a cent." The account had already spent $52 of $70 in
   credits before the audit even started (from live ingestion + earlier
   proofread runs), and the audit itself burned the remaining ~$17.6 and hit
   `402 Insufficient credits` after only 143 of 1,761 rows (8%). **The account
   balance is currently $0**, meaning the mini's live ingest pipeline is
   presumably running via launchd right now and silently falling back to
   regex-only on every poll until credits are topped up.
2. **the architectural blockers were real, but so is a live reliability bug
   nobody had diagnosed.** OpenRouter's default provider route for this model
   (Google AI Studio) has a 5 req/min free-tier cap; any ingest concurrency
   above ~1 blows through it, producing 429s that surface as a misleading
   "insufficient credits" 402. This has likely been silently degrading live
   proofread quality for a while (any anecdotal "openrouter proofread doesn't
   seem to fire" reports are probably this).
3. **the categorization and currency bugs V3_SPEC set out to fix are worse in
   the live data than assumed**, and one new class of bug wasn't in scope at
   all: manually-pushed "upcoming AutoPay" pre-debit notices are being stored
   as real transactions via the app's manual-entry path, which bypasses every
   guard V3_SPEC's pipeline design puts in front of SMS ingestion. A pipeline
   fix that only touches the ingest path leaves this hole open.
4. **the mini has no git history**, so every fix made today (prompt rewrite,
   schema type widening, provider pin) exists only as uncommitted files on
   disk with no diff trail, no revert path, and no way to review what changed
   without re-reading full files.

In short: V3_SPEC.md's architecture still holds up, but its cost model does
not, its category/currency severity was underestimated, a new gap (manual-entry
bypass) was found, and its own "make the mini a git repo first" prerequisite is
now overdue.

## solution

Today's session did **not** attempt the full V3_SPEC rollout. It did three
things, in order, and this document captures the result plus the concrete next
steps to pick the rollout back up:

1. **Ran the audit** (`kharcha-mini/scripts/audit-reparse.ts`) — a read-only
   re-parse of the mini's 1,761-row canonical table against a v3-candidate
   prompt — until it ran out of credits at row 143. Findings written to
   `kharcha-mini/docs/AUDIT_FINDINGS_2026-07-17.md` (read in full for this
   document; summarized below).
2. **Shipped prompt/schema-level fixes immediately**, ahead of the full
   phased rollout, because they were cheap, low-risk, and independently
   valuable regardless of which model V3_SPEC eventually pins:
   - `kharcha-mini/src/ingest/openrouter.ts`: currency-aware schema
     (`currency`/`original_amount`/`amount_inr` fields in the LLM response,
     with a `resolveInrAmount` helper and a manually-maintained fallback FX
     table for when the SMS doesn't state the INR amount itself), a widened
     `is_transaction` gate with explicit AutoPay/OTP/mandate examples, an
     `investment` type addition, the canonical category vocabulary from
     V3_SPEC §"canonical category vocabulary", alias-hint injection into the
     prompt (the fix that the "RAVINDRA KUMAR YADA(V)" tiffin-vendor finding
     below proves is load-bearing, not optional), and the
     `provider: { ignore: ["Google AI Studio"] }` pin that fixes the 429/402
     rate-limit bug.
   - `kharcha-mini/src/ingest/proofread.ts`: now looks up and forwards an
     alias hint into the OpenRouter call even on the non-short-circuit path.
   - `kharcha-mini/src/parsers/utils.ts`: `ParsedTransaction.type` widened to
     include `"investment"`.
   - `kharcha-mini/src/scripts/verify-proofread.ts`: test fixture updated for
     the new required fields.
   - `Kharcha/lib/gemini/client.ts`: the same prompt/schema fixes mirrored for
     the app's on-device Gemini client (used by the manual paste-sheet and the
     Gmail-sync fallback) — kept in parity since it isn't removed until
     V3_SPEC phase 3.
   - `Kharcha/components/parse-message-sheet.tsx`: local-regex-fallback object
     literal updated to satisfy the widened `GeminiParsedTransaction` type
     (hardcodes `currency: "INR"` since the offline regex fallback has no
     currency detection).
   - Both repos typecheck clean (`bun run typecheck`, `npx tsc --noEmit`).
     Lint/`pnpm quality`/`pnpm dead-code` **not yet run** — per repo
     convention the agent does not run `pnpm` commands; the user needs to run
     `pnpm quality` and confirm.
3. **Did not** apply any of the mini's schema migrations from V3_SPEC §"schema
   evolution" (`currency`, `original_amount`, `fx_rate`, `needs_review`,
   `parse_attempts`, `parse_version`, `deleted_at` columns; `message_templates`;
   `skipped_messages`). This is a **known, explicit gap**: the prompt changes
   above make the LLM *compute* `currency`/`original_amount`/`fx_rate`
   in-memory, but `kharcha-mini/src/db/schema.ts` (read in full — see below)
   still only has a plain `amount` column, so today only the resolved INR
   `amount` is persisted and the corrected currency detail is thrown away at
   insert time. **Net effect: today's fix stops *future* foreign-currency
   rows from being silently wrong, but it does not yet let the app display
   "$8 (₹700)" instead of a bare number — that needs the migration in
   V3_SPEC phase 1.**

Nothing else from V3_SPEC moved: the `POST /parse` endpoint, the app rewire off
on-device Gemini, the three app-side debt fixes (WAL export/import, manual-row
pull-skip, pagination), and the historical repair pass are all exactly where
V3_SPEC left them — undone. This document exists so that state is legible
without re-deriving it, and so the one new open decision (which model to run
the pipeline on) is captured as a decision point rather than silently defaulted
back to `gemini-3.5-flash`.

## user stories

Numbered for traceability against future phase work. "AI-first" stories map to
V3_SPEC phase 2; "debt" stories map to phase 0; "repair" stories map to phase 4.
Each restates who benefits and why, using confirmed audit evidence rather than
hypothetical framing, since the point of this delta doc is that these are no
longer speculative.

1. **As the sole user of this app**, I want the pipeline decision-maker (human
   reviewing cost/model choice) to see the true per-call cost of the current
   model *before* flipping `parse_mode` to `ai_first`, so that a personal
   expense tracker doesn't quietly cost $100+/month for a task that should
   cost cents. (Confirmed: $0.12/call measured live, not estimated.)
2. **As the sole user**, I want a non-reasoning-forced model evaluated and
   pinned before the phase 2 flip, so that the AI-first inversion's cost
   profile matches the "trivial extraction task" it actually is, rather than
   inheriting a reasoning tax meant for harder problems.
3. **As the sole user**, I want the OpenRouter account topped up and the
   `provider: { ignore: ["Google AI Studio"] }` pin live in production
   (not just in the audit script) immediately, independent of the model
   decision, because live ingestion is currently degraded — every poll that
   hits the rate limit falls back to regex silently, meaning today's
   category/currency bugs keep accumulating in real time while a decision is
   pending.
4. **As the sole user**, I want a monitoring signal (kuma heartbeat note, or a
   digest line) when the pipeline is running in degraded/fallback mode for N
   consecutive polls, so a $0-balance or rate-limit situation is visible
   without having to manually query the db or read logs.
5. **As the sole user**, I want the mini repository under git version control
   before any further pipeline surgery lands, so that today's uncommitted
   prompt rewrite (and every future change) has a diff trail and a revert
   path. This was already true before today's audit; today's audit made
   uncommitted, unreviewed logic changes to a live production pipeline with
   no git repo backing it, which raises the risk of an unrecoverable mistake.
6. **As the sole user**, I want the mini's schema migration (currency,
   original_amount, fx_rate, needs_review, parse_attempts, parse_version,
   deleted_at, message_templates, skipped_messages) applied so that the
   richer currency/original-amount data the prompt fix already computes
   in-memory today actually gets persisted, instead of being computed and
   discarded at insert time.
7. **As the sole user**, I want the app's transaction detail view to show
   `"$12.99 (₹1,143)"` for foreign-currency rows once the schema lands, so a
   USD subscription charge is legible as USD, not a bare number that looks
   like an INR amount an order of magnitude too small.
8. **As the sole user**, I want the 167 historical OTP-as-transaction rows
   (₹56,738, confirmed duplicates of same-day real transactions) tombstoned
   via `deleted_at` — not hard-deleted, so `source_message_guid` keeps
   blocking re-ingestion — because they are currently double-counting spend
   in every insights total and monthly rollup.
9. **As the sole user**, I want Axis's equivalent OTP guard spot-checked
   against historical data the same way HDFC's was, since the audit only
   sampled HDFC for this pattern and Axis has an equivalent
   `isAxisNonTransactionNotice` guard that may have the same pre-guard
   residue.
10. **As the sole user**, I want the manual-entry / paste-sheet persistence
    path to run the same `is_transaction` gate the SMS-ingestion pipeline
    uses, because the confirmed "upcoming AutoPay" ghost transactions (ids
    1739, 1744, 1756, 1758, 1760 in the live mini table) arrived via manual
    entry specifically *because* that path skips every guard the ingestion
    pipeline has. Fixing only the ingest side leaves this hole open — this is
    a scope addition to V3_SPEC's phase 2/3, not something the existing plan
    already covers.
11. **As the sole user**, I want every USD-billed subscription (OpenRouter,
    Claude, T3 Chat, and any others sharing the same regex path) corrected in
    historical data via the phase 4 repair pass, since the audit confirmed
    the bug is not isolated to the two sampled rows — it's structural to how
    the regex parser extracts amounts with no currency awareness on this
    card.
12. **As the sole user**, I want the phase 4 historical repair pass to
    recover the two large NEFT credits (₹379,009 and ₹266,462) and the
    ₹1,525,000 mobile banking debit currently sitting as `amount: 0,
    merchant: 'Unknown', parsed_by: 'failed'`, since these are real money
    completely absent from every insights total today, and the audit's v3
    prompt already recovered all three with `confidence: 'high'` in the
    143-row sample.
13. **As the sole user**, I want the repair pass (and any future reparse) to
    always inject alias context into the AI prompt, never call the model
    "bare," because the audit demonstrated that a bare call recategorizes a
    known recurring tiffin vendor (`RAVINDRA KUMAR YADA(V)`, 9 occurrences,
    correctly `Food` today via an existing alias) down to `Other` — a person's
    name carries no category signal without the alias. This validates
    V3_SPEC's design and confirms the fix implemented today in
    `openrouter.ts`/`proofread.ts` is necessary, not cosmetic.
14. **As the sole user**, I want the ~20% "Other"-category pileup (29/143 in
    the sample; extrapolates to ~790/1,761 rows with *some* issue) addressed
    by the phase 4 repair pass rather than left as permanent insights noise,
    since most of these have an obvious correct category (Food for cafes/
    Swiggy, Entertainment for DAZN/YouTube/Netflix, Shopping for Amazon) that
    the existing regex-only pipeline simply never attempted to infer.
15. **As the sole user**, I want the two NACH/mutual-fund debits to "INDIAN
    CLEARING CORP" reclassified from `type: 'expense'` to `type: 'investment'`
    as part of the repair pass, and I want to confirm the *live* ingest
    pipeline sources its `date` field from the SMS's own `chat.db`
    received-at timestamp rather than AI-inferred content-based dates — the
    audit's after-the-fact script had no access to that timestamp and
    defaulted to "today," which is a script limitation, not necessarily a
    live pipeline bug, but needs confirming before trusting repair-pass dates.
16. **As the sole user**, I want the garbled-merchant artifact seen in the
    audit (`"HACK"` from a truncated `NEFT/CMS.../H...` string) re-checked
    against the *full* raw message (not the audit's 300-char snippet) before
    the repair pass trusts any merchant name derived from a similarly
    truncated pattern, to avoid writing a nonsense alias into
    `merchant_aliases`.
17. **As the sole user**, I want the three app-side debt fixes (VACUUM INTO
    export, manual-row pull mapping, paginated pull) to land and be verified
    independently of the AI-first pipeline work, since V3_SPEC already scopes
    these as phase 0 with no dependency on the model/cost decision — there is
    no reason to block them on the open question in this document.
18. **As the sole user**, once phase 1's schema migration and category
    vocabulary migration land, I want `select distinct category` on both the
    mini and app databases to show only canonical values, confirming the
    long-standing "everything mini-synced lands in Other" symptom (1,124 of
    1,774 rows today) is actually fixed rather than papered over by the
    prompt change alone.
19. **As the sole user**, I want a `--dry-run` diff report from the phase 4
    repair script reviewed by me personally (not auto-applied) before any
    `--apply`, per V3_SPEC's existing design, with the OTP tombstones, the
    currency corrections, and the category corrections all visible as
    separate line items so I can sanity-check each category of change
    independently rather than approving one large diff blindly.
20. **As the sole user**, after `--apply`, I want the app's "re-sync from
    mini" action (V3_SPEC §6.4) to reflect the corrected totals — specifically,
    I want to be able to confirm monthly spend visibly drops by the OTP
    double-count amount (₹56,738) and that foreign-currency rows now show
    their true INR-equivalent amount instead of the currency-blind number.

## implementation decisions

- **This document does not silently resolve the model/cost question.** It is
  captured below as an open decision point requiring investigation, not a
  default. Continuing to run the live pipeline on `gemini-3.5-flash` without
  addressing the reasoning-tax cost is an explicit (bad) option, not the
  absence of a decision.
- **The prompt/schema-level fixes shipped today were deliberately decoupled
  from the phased rollout.** They are strict improvements to correctness
  (currency awareness, AutoPay/OTP gate, alias injection, canonical
  categories) that hold regardless of which model ends up pinned, and
  shipping them now — even without schema migration or `parse_mode` flagging
  — reduces the rate of *new* bad data accumulating while the larger decision
  is pending. This required judgment: V3_SPEC's phase 2 originally bundled
  the prompt rewrite with the pipeline inversion and shadow-mode rollout;
  today split "improve the prompt" from "flip the pipeline order," on the
  reasoning that a better prompt run through the *existing* conditional-
  proofread trigger (proofread only fires on failed/generic-placeholder
  parses) is strictly better than the old prompt in that same position, even
  before the AI-first inversion itself ships.
- **The provider pin (`ignore: ["Google AI Studio"]`) should be treated as a
  standalone hotfix**, deployable independent of everything else in this
  document, because it fixes a live reliability bug (silent proofread
  fallback due to rate-limit-induced 429/402s) that predates and is unrelated
  to the v3 rollout.
- **Git-init the mini before any further pipeline surgery.** This was already
  V3_SPEC's phase 1 prerequisite; this document elevates it because today's
  session added uncommitted logic changes on top of an already-uncommitted
  history. Recommend: `git init`, an initial commit capturing the pre-audit
  state if recoverable (check for any existing backup/snapshot under
  `kharcha-mini/data/`), then a commit for today's prompt/schema changes,
  before touching anything else.
- **The manual-entry `is_transaction` gate (story 10) is a scope addition to
  V3_SPEC**, not something the existing phase plan already covers as written.
  V3_SPEC's pipeline diagram and phased plan describe the SMS-ingestion path
  only. Recommend folding this into phase 3 (app rewire) since that is where
  the manual-entry/paste-sheet code is touched anyway, rather than opening a
  new phase.
- **Sequencing recommendation for immediate next steps, in order:**
  1. Top up OpenRouter credits (nothing else runs at scale until this is
     resolved; current balance $0).
  2. Confirm the provider pin is live in the actual production path
     (`src/ingest/openrouter.ts`, already patched this session per the audit
     doc) — verify a real poll cycle picks it up.
  3. Git-init `kharcha-mini`; commit current state.
  4. Investigate non-reasoning-forced flash-tier alternatives (see open
     question below) before deciding whether to re-pin `openrouter_model`.
  5. ~~Re-run the full audit across all 1,761 rows once credits are
     available~~ — superseded same evening: a full-coverage Claude audit of
     all 1,623 SMS-derived rows completed with real counts (see addendum at
     the end of this document and the expanded
     `kharcha-mini/docs/AUDIT_FINDINGS_2026-07-17.md`). An OpenRouter re-parse
     is now only a spot-check tool for validating the replacement model.
  6. Resume V3_SPEC's phased plan starting at phase 0 (app debt fixes — no
     dependency on the model decision, can proceed in parallel with steps
     1–5) and phase 1 (schema + vocabulary migration on the mini).
- **Axis OTP spot-check (story 9)** should happen before or during the phase 4
  repair pass, not as a separate one-off — it's the same tombstone mechanism,
  just a different bank's historical window.

## open question — not resolved by this document

**What model/provider should the AI-first pipeline actually run on?**

`google/gemini-3.5-flash` via OpenRouter is confirmed unsuitable at its
current ~$0.12/call reasoning-tax cost for a task this trivial. Before
re-committing to any model as the phase 2 default (`openrouter_model` config
key), investigate:

- a Gemini Flash variant without mandatory reasoning (if OpenRouter or Google
  AI Studio direct exposes one),
- capping `reasoning.effort: "minimal"` if the chosen model supports a
  reasoning-effort parameter rather than an on/off toggle,
- a different non-reasoning-forced model entirely (other providers' flash/mini
  tiers) at comparable structured-output reliability,
- direct-to-provider API access (bypassing OpenRouter's markup/routing
  entirely) if a suitable model is single-provider anyway.

This decision blocks the phase 2 flip (`parse_mode=ai_first`) and the phase 4
repair pass at scale, but does **not** block phase 0 (app debt fixes) or
phase 1 (schema migration) — the additive schema migration is model-agnostic
and should proceed regardless.

## testing decisions

Per V3_SPEC's existing "each phase ships alone and is verified before the next
starts" discipline — this document does not invent new seams, it restates the
relevant ones plus adds the checks specific to today's findings:

- **Provider-pin hotfix:** verify by watching one live launchd poll cycle
  after the pin is confirmed deployed; check that a proofread call that would
  have hit Google AI Studio's rate limit now routes to the paid Vertex route
  (log line or response provider metadata), not a silent regex fallback.
- **Credit top-up + monitoring:** verify the account balance is nonzero, then
  confirm the digest/kuma heartbeat surfaces a degraded-mode signal correctly
  by temporarily forcing a budget-cap or auth failure and checking it's
  visible without querying the db directly (story 4).
- **Model decision:** before pinning any replacement model, verify structured-
  output reliability (schema-valid JSON on the first try, no retry) across a
  sample of at least the same 143 rows the audit already has ground truth for,
  and verify actual per-call cost against OpenRouter's billing, not the
  provider's advertised token price (the reasoning-tax discovery is exactly
  the kind of thing an advertised rate doesn't surface).
- **Mini git-init:** verify `git log` shows the pre-fix and post-fix states as
  separate commits, and that `git status` is clean afterward — this is a
  process/safety check, not a functional one.
- **Phase 0 (app debt fixes)** — unchanged from V3_SPEC: export a backup,
  immediately import it, confirm the preview shows correct stats and commits
  clean; on a scratch install, confirm a fresh pull retrieves full mini
  history including manual rows in one sync, and the row count matches
  `sqlite3 kharcha-mini.db 'select count(*) from transactions'`.
- **Phase 1 (mini schema + vocabulary)** — unchanged from V3_SPEC, plus: after
  migration, confirm the currency/original_amount/fx_rate columns are actually
  populated on a live-ingested USD row (not just present in the schema) —
  today's gap (computed-then-discarded) is exactly the kind of thing that
  looks fixed from the migration alone but silently isn't without checking an
  actual row.
- **Manual-entry gate (story 10, folded into phase 3)** — verify by
  reproducing the exact confirmed bug: push an "upcoming AutoPay" pre-debit
  notice through the manual-entry/paste-sheet path post-fix and confirm it's
  rejected (`is_transaction: false`) rather than silently persisted, using the
  same phrasing as the five confirmed ghost rows (ids 1739, 1744, 1756, 1758,
  1760) as the test input.
- **Phase 4 (historical repair)** — unchanged from V3_SPEC (dry-run tsv,
  owner-reviewed, `--apply`, app re-sync), plus: spot-check the OTP tombstone
  count post-apply equals 167 (or the corrected count after the Axis spot-
  check, story 9) and that `select round(sum(amount),2) from transactions
  where raw_text like '%OTP%' and amount>0 and deleted_at is null` returns 0
  or near-0 after apply; spot-check at least one of the two recovered NEFT
  credits and the recovered mobile-banking debit appear correctly in the
  app's insights total after re-sync.

## out of scope

- Re-litigating V3_SPEC's architecture (pipeline order, `/parse` endpoint
  design, schema shape, canonical category vocabulary). None of today's
  findings contradict the architecture — they contradict a cost assumption
  and surface one scope gap (manual-entry gate). The architecture stands.
- Multi-tenant/publishing, Gmail ingestion on the mini, local models,
  real-time FX rates, retry queues/offline write buffering — all remain
  non-goals per V3_SPEC, unchanged by today's findings.
- Actually running the phased rollout. This document is a checkpoint and
  decision record, not an execution log — phases 0–4 remain exactly as
  specified in V3_SPEC.md; nothing here should be read as "phase N is done."
- Choosing the replacement model. The open question above is deliberately
  left open per the user's instruction not to silently resolve it — this
  requires investigation (pricing pages, structured-output reliability
  testing) before a decision, not a spec-writing judgment call.
- Running `pnpm lint` / `pnpm quality` / `pnpm dead-code` on the app changes,
  or `bun run` lint-equivalents on the mini changes. Per repo convention the
  agent does not run `pnpm` commands; the user needs to run these and confirm
  before today's prompt-level changes are considered fully verified (only
  typecheck has been confirmed clean so far).
- Committing anything to git in either repo. Per this task's instructions,
  nothing is published; this document is local-only, and the recommendation
  to git-init the mini is a recommendation for the user to act on, not
  something performed in this session.

## further notes

- The two source documents this delta is built on are:
  `Kharcha/docs/V3_SPEC.md` (untracked, dated 2026-07-17, the full architecture
  spec) and `kharcha-mini/docs/AUDIT_FINDINGS_2026-07-17.md` (the live audit
  output this session produced). Read both in full alongside this document —
  this delta intentionally does not restate V3_SPEC's architecture, schema
  DDL, or phase-by-phase verification steps in full; it references them by
  section name and only elaborates where today's findings add something new.
- The audit's 143-row sample (8% of the full 1,761-row table) found issues in
  45% of rows; extrapolated to the full table that's **~790 rows with at least
  one issue**. The phase 4 repair pass should be scoped and time-boxed with
  that number in mind, not the smaller sample count — the true scale of the
  historical cleanup is meaningfully larger than the sample alone suggests.
- `kharcha-mini/src/db/schema.ts` was read in full for this document and
  confirmed to match V3_SPEC's description exactly: no
  currency/original_amount/fx_rate/needs_review/parse_attempts/parse_version/
  deleted_at columns exist yet; `parsedBy` enum is currently
  `["regex", "openrouter", "failed", "manual"]` (no `"skipped"` value, since
  `skipped_messages` as a separate table hasn't been created either); `type`
  already supports `"investment"` at the schema level, matching V3_SPEC's
  note that only the classification logic (not the schema) was missing for
  that type.
- The live ingest pipeline is presumably still polling via launchd against a
  $0 OpenRouter balance as of this writing, meaning every poll cycle since the
  credits ran out has been falling back to regex-only parsing — the same
  category/currency bugs this whole effort is meant to fix are still
  accumulating in real time until credits are topped up. This is the single
  highest-priority action item in this document, ahead of the model/cost
  decision itself (the account can be topped up on the existing model while
  the replacement is being evaluated, since the pin fix at least stops the
  rate-limit-induced silent fallback).
</content>

## addendum — full-coverage audit landed (same evening, 2026-07-17)

A second audit completed after this document was written: Claude reviewed
**every SMS-derived row individually** (1,623 rows), replacing the 143-row
extrapolation with real counts. Full details in
`kharcha-mini/docs/AUDIT_FINDINGS_2026-07-17.md` (addendum section);
machine-readable per-row corrections in
`kharcha-mini/data/audit-findings-full-2026-07-17.json`. What it changes about
this document:

1. **The extrapolation held**: 696/1,623 rows (43%) have ≥1 issue, vs the 45%
   extrapolated. Real breakdown: 353 wrong-category, 195 not-a-transaction
   (166 OTP rows — confirming §1's 167), 183 garbled merchants, 68 missed
   transactions, 23 USD-as-INR rows.
2. **Two new money-correctness classes the sample missed** (add to phase 4
   repair scope and to the prompt's is_transaction guidance):
   - **Credit-card bill payments parsed as income** — 7 rows, ₹132,841 of
     fake income (self-transfers; several also pair with a captured bank
     debit, double-counting both directions). Total fake income: ₹114,971
     across 9 income-typed ghost rows.
   - **Salary was never captured** — 10 recurring month-end NEFT credits
     (~₹2.66–2.71L each, ~₹2.7M total) sit in `parsed_by: 'failed'`. Remitter
     truncates to `HACK`; resolve the real employer string from the full
     message before aliasing (story 16's warning applies). Missed
     transactions overall: 68 rows, **₹3,953,343 absent from every total**.
3. **The repair pass no longer depends on the model decision or credits.**
   The findings JSON contains a per-row verdict + suggested correction for
   every problem row; the phase 4 repair script can consume it
   deterministically at zero LLM cost (stories 8, 11, 12, 14, 15 are all
   covered by it). The dry-run → owner review → apply discipline (story 19)
   is unchanged.
4. **Merchant normalization rules are now concrete**: strip
   `PYU*`/`RAZ*`/`RSP*`/`PTM*` gateway prefixes before alias lookup; map
   legal entities (BUNDL TECHNOLOGIES→Swiggy, CTRLX TECHNOLOGIES→Swish,
   YOUTUBEGOOG→YouTube, FLIPKART PA→Flipkart). Feed into
   `normalizeMerchant()` and/or alias seeds during phase 1.

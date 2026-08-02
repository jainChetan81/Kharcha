# Implementation Plans

Generated from a full-codebase audit (10 subagents surveying every screen,
component, hook, and lib module; adversarial verification on every
critical/high finding — 68 deduplicated findings, 85 raw findings across
subsystems) plus a follow-up asset-integrity check. Each of the 14 plans
below was independently re-verified against live code by a separate agent
before being written — several corrected or expanded on the original audit
(see "Corrections from re-verification" below); none were rubber-stamped.

Execute in the order below unless dependencies say otherwise. Each executor:
read the plan fully before starting, honor its STOP conditions, and update
your row when done.

Repo-wide executor rules: never run `pnpm` commands yourself — tell the
operator which command to run and wait for the result (`CLAUDE.md`).
NativeWind classes only, no `any`, functional components only, TanStack
Query for all data fetching, screens never import `lib/db` directly.

## Already resolved (not in the table below)

Three of the audit's four **critical** findings — the delete-before-write
data-loss bugs in local DB import (`lib/db/backup.ts`), cloud DB restore
(`lib/cloud-backup/index.ts`), and iCloud backup upload
(`lib/cloud-backup/icloud.ts`) — were fixed and merged in **PR #33** before
this plan batch was written. That fix also incidentally resolved the
audit's "risky swap logic duplicated between `writeDbBytes()` and
`commitImport()`" architecture finding, by introducing the shared
`stageFile()`/`commitStagedFile()`/`discardStagedFile()` helpers in
`lib/db/files.ts` that plans 001–014 below can (and do) point to as the
reference pattern for staged/atomic file writes. The fourth critical
finding — the swipe-to-delete stale-closure bug — is **plan 001** below.

## Execution order & status

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
|------|-------|----------|--------|------|------------|--------|
| 001 | Fix swipe-to-delete gesture bugs (stale closure + wrong-direction commit) | P0 | S | LOW | — | IN PROGRESS (code complete, on-device manual smoke test pending) |
| 002 | Boot sequence failure fallback (splash-screen hang) | P0 | S | LOW | — | IN PROGRESS (code complete, on-device manual smoke test pending) |
| 003 | Gmail/SMS sync data-integrity hardening | P1 | L | MED | — | IN PROGRESS (all 9 steps code complete, manual smoke tests pending) |
| 004 | Gmail-sync screen and hook correctness | P1 | M | LOW | — (soft: touches adjacent files to 003, no hard order) | IN PROGRESS (all 5 steps code complete, manual smoke tests pending) |
| 005 | Database layer referential integrity and correctness | P1 | M | MED | — | IN PROGRESS (steps 1-3, 6-8 code complete; steps 4-5 blocked — need operator to run the live-data duplicate-check queries before adding unique indexes) |
| 014 | App icon/splash asset integrity (missing file, format mismatch) | P1 | S | LOW | — | IN PROGRESS (step 1 code complete; steps 2-3 blocked — no image-conversion tool in this environment, ImageMagick install pending) |
| 006 | Double-toast error-feedback cleanup | P2 | M | LOW | — | IN PROGRESS (all 9 steps code complete, manual smoke tests pending) |
| 007 | Android widget fixes | P2 | S | LOW | — | IN PROGRESS (all 3 steps code complete, manual on-device smoke test pending) |
| 008 | AI parsing and mini-sync pipeline hardening | P2 | M | MED | — (soft: `app/_layout.tsx`, see note) | IN PROGRESS (all 6 steps code complete, manual smoke tests pending) |
| 010 | Transaction and subscription form correctness | P2 | M | LOW | — | IN PROGRESS (all 7 steps code complete, manual smoke tests pending) |
| 013 | Security and data-handling hardening | P2 | S | LOW | — (soft: `app/_layout.tsx`, `lib/db/subscriptions.ts`, see note) | IN PROGRESS (all 5 steps code complete — Crashlytics decision point implemented per plan's own recommendation, Option B — manual smoke tests pending) |
| 009 | Fix silent error swallowing in Drive backup lookup; reuse stored file id on upload | P3 | S | LOW | — | IN PROGRESS (all 3 steps code complete, manual smoke test pending) |
| 011 | Feature-completeness and empty-state gaps | P3 | M | LOW | — | IN PROGRESS (all 6 steps code complete, manual smoke tests pending) |
| 012 | UI component deduplication and consistency | P3 | L | MED | — | IN PROGRESS (all 5 steps code complete — steps 1/2 scoped down per documented deviations from plan drift, see below — manual smoke tests + step 5.2 visual check pending) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale).

## Dependency notes

None of these plans have a **hard** dependency on another — each was
scoped to a disjoint set of files specifically so they could run in any
order, or in parallel worktrees. Three **soft coordination notes** surfaced
during drafting (touching the same file at different, non-overlapping line
ranges — not a functional conflict, just worth sequencing to avoid a messy
diff/merge):

- **002 and 008** both touch `app/_layout.tsx` — 002 owns the root boot
  `useEffect` (~lines 174–198), 008 owns `ForegroundMiniSync` (~lines
  113–141). Different functions; land either first.
- **002 and 013** both touch `app/_layout.tsx` (013 also touches
  `lib/db/subscriptions.ts` for the analytics-logging fix, which 005
  neighbors but doesn't overlap). Same file, disjoint regions.
- **003 and 004** both work inside the Gmail sync surface — 003 owns
  `lib/gmail/sync.ts` and `lib/gmail/parsers/**`; 004 owns
  `hooks/use-gmail-sync-ui.ts`, `app/gmail-sync.tsx`, and
  `hooks/use-auto-refresh-prefs.ts`. No file overlap, but both change
  Gmail-sync user-facing behavior — read the other plan's "Why this
  matters" before starting either, so the two fixes tell a consistent story
  (especially: 004's fix for the "Enable Gmail Sync" toggle and 003's
  cursor/dedup fixes both change what "a sync happened" means).

## Corrections from re-verification

Every plan's re-verification step (re-reading the actual current code,
not trusting the original audit's line numbers or characterization)
surfaced real corrections. Recorded here so nobody re-discovers these the
hard way:

- **Plan 012 corrects a wrong audit finding**: the original audit claimed
  `components/ui/inline-add-sheet.tsx` (`InlineAddSheet`) was dead code.
  It isn't — the audit's grep scope (`app` + `components`) excluded
  `hooks/`, where `hooks/use-inline-adders.tsx` imports and renders it
  three times, consumed by `components/transaction-form.tsx` and
  `components/subscription-form.tsx`. The real, narrower finding (6 other
  call sites still hand-duplicate the pattern `InlineAddSheet` already
  encapsulates) is what plan 012 actually fixes. Also corrected: the
  `investment-fields.tsx` `any`-widening finding named "all 12 generic
  parameters" — it's 11 of 12; the first is correctly typed.
- **Plan 004 found the "Enable Gmail Sync" toggle is worse than the audit
  described**: not just "does nothing" — it's `false` by default for every
  user (never seeded) and currently *disables the manual "Sync Now"
  button*, while pull-to-refresh (the only thing that actually syncs
  automatically today) ignores the flag entirely.
- **Plan 003 found a 9th file** with the same wall-clock-date-fallback bug
  the audit's `fallbackNow()` grep caught in 8 files — `lib/gmail/parsers/indusind.ts`
  has the identical bug via a differently-named local `today()` helper the
  grep missed.
- **Plan 005 found a 5th call site** for the `transaction_tags`-orphaned-on-delete
  bug beyond the 3 the audit named: `deleteSubscription()` in
  `lib/db/subscriptions.ts`.
- **Plan 006 expanded 6 seeded findings to 21 confirmed sites** across 10
  files, by grepping every `mutateAsync`/`.mutate()` call site in the app
  against its mutation hook's `onError`/`onSuccess` — while also confirming
  several near-identical-looking sites are *not* duplicates (the mutation
  hook has no `onError` of its own there) and correctly leaving those
  alone.
- **Plan 011 found a 7th related site**: `app/edit-subscription/[id].tsx`
  has the identical bare-spinner-forever gap as `app/holding/[id].tsx`
  (audit only mentioned it as supporting evidence for a different finding,
  not its own line item).
- **Plan 012's Step 1 execution found a conflict with plan 006** (already
  merged by the time 012 was executed): migrating `app/config/tags.tsx`
  and `components/transaction-form.tsx`'s "New Tag" sheet to
  `InlineAddSheet` would reintroduce the exact double-toast bug plan 006
  fixed, since `useAddTag`'s own `onError` already toasts and
  `InlineAddSheet` toasts unconditionally on catch. Left those two sites'
  `BottomSheet` structure as-is (the plan's own documented Option-B escape
  hatch); migrated only the 3 sites confirmed to have no competing
  `onError` (categories x2, sources). Still applied the independent
  `isNew` bug fix to `transaction-form.tsx`'s tag-add site.
- **Plan 012's Step 2 `addLabel="tag"` suggestion was wrong**: `ChipPicker`
  substitutes `addLabel` verbatim into both the button text (`+ {addLabel
  ?? "New"}`) and the a11y label (`` `Add ${addLabel ?? "new"}` ``), so
  `"tag"` would have rendered `"+ tag"` / `"Add tag"`, not the original
  hardcoded `"+ New tag"` / `"Add new tag"`. Used `addLabel="New tag"`
  instead — exact match on the visible button text; the a11y label ends up
  `"Add New tag"` (differs only in casing from the original `"Add new
  tag"`), chosen over a `.toLowerCase()`'d label to avoid changing the 7
  pre-existing `ChipPicker` callers' capitalized a11y text.
- **Plan 008 initially dropped a finding by mistake** (a drafting-prompt
  gap on my part, not a re-verification result) — audit finding index 42
  (mini-sync/Gmail-sync hand-rolled cache invalidation duplicating
  `useInvalidateTransactions`) was left out of an early draft's scope. It's
  back in as plan 008's Step 6, re-verified against live code.

## Findings considered and not planned

- **Enabling `PRAGMA foreign_keys = ON` globally** (would auto-enforce
  every declared `ON DELETE CASCADE` at once, closing the `transaction_tags`
  gap and any other cascade gaps in one change): plan 005 deliberately
  scoped this *out* and hand-writes the specific missing cleanup instead,
  recommending the global-enforcement option be its own future plan — it's
  a real behavior change that could surface latent bugs elsewhere in code
  that may be relying on cascades not firing, and deserves dedicated review
  rather than being bundled into a referential-integrity bug-fix plan.
- **A full `AppState`-driven automatic Gmail sync** (mirroring the existing
  `ForegroundMiniSync` pattern), as one of two options for fixing the inert
  "Enable Gmail Sync" toggle: plan 004 presents this as an explicit
  operator decision point rather than picking it unilaterally, and defaults
  to the smaller fix (wire the existing flag into pull-to-refresh, fix the
  copy) — the larger option is documented in plan 004 for the operator to
  request if wanted.
- **Building the UI `lib/db/holdings.ts`'s doc comment promises** (a manual
  "recompute" recovery button for holdings drift): plan 011 recommends
  fixing the doc comment to match reality instead, absent evidence drift is
  an observed recurring problem for users.
- **A settings toggle to opt out of Crashlytics**: plan 013 presents this
  as a decision point and recommends the cheaper fix (drop the `user_name`
  attribute from crash reports; keep collection always-on as a documented
  tradeoff for a personal-use app) over building new settings UI — flagged
  for the operator to override if a full opt-out is wanted.
- **In-app UI icon system redesign**: audited while scoping plan 014 (the
  `Icon` wrapper in `components/ui/icon.tsx` + `lucide-react-native`, ~55
  call sites) and found already consistent — a single wrapper component,
  centrally used, with icon sizes (`size-4` through `size-12`) applied
  contextually rather than randomly. No plan needed.
- **App icon/splash/feature-graphic artwork itself**: visually reviewed
  while scoping plan 014 and found to be a coherent, finished brand mark
  already (not a placeholder). Plan 014 fixes asset *integrity* bugs
  (a missing file, a mislabeled format, a resolution mismatch) — it does
  not redesign anything, and no image-generation tool was used to produce
  any of these plans' findings.

# Plan 004: Skip already-synced Gmail messages before downloading their bodies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- lib/gmail/sync.ts components/sync-results-sheet.tsx`
> If `lib/gmail/sync.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

Gmail sync currently downloads the **full body of every candidate message** from the Gmail API (`?format=full`, one HTTP round-trip per message) and only *then* checks whether that message was already synced (`gmail_message_id` lookup). On a re-sync, every previously synced email is re-downloaded just to be skipped. Sync time and Gmail API quota scale with total history instead of with new mail. Message IDs are already known before any body fetch, so the dedup check can run first — one batched DB query — and skip both the network fetch and the per-message DB query for duplicates.

## Current state

- `lib/gmail/sync.ts:263-299` — the loop (abridged):
  ```ts
  for (const message of messages) {
    ...
    const msgResponse = await fetch(
      `${GMAIL_API.MESSAGES}/${message.id}?format=full`,        // ← network fetch FIRST
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const msgData = await msgResponse.json();
    ... // extract from/subject/body
    const existing = await db                                    // ← dedup check SECOND
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.gmail_message_id, message.id))
      .limit(1);
    if (existing.length > 0) {
      result.skipped++;
      result.emailLogs.push({
        id: message.id, from, subject,
        parsedBy: PARSED_BY.REGEX,
        status: EMAIL_LOG_STATUS.DUPLICATE,
      });
      continue;
    }
    ...
  }
  ```
- `messages` is accumulated earlier in the same function from Gmail list queries (`messages.push(m)` at `sync.ts:240`) — each entry already has `.id` before any body fetch.
- Duplicate entries currently appear in `result.emailLogs` with the fetched `from`/`subject`. After this change those two fields are unavailable for duplicates (we skip the fetch). `components/sync-results-sheet.tsx` renders these logs — check how it displays `from`/`subject` for `DUPLICATE` entries.
- Conventions (`.claude/rules/project-conventions.md`): batch-fetch to avoid N+1 — "Subscription processing batch-fetches to avoid N+1 queries — follow this pattern"; see `lib/db/subscriptions.ts:233-251` (`processSubscriptions` batch-loads the month's transactions into a `Map<number, Set<string>>` before its loop) as the exemplar.
- SQLite has a bound-parameter limit (999 classic / 32766 newer); chunk `inArray` queries at ≤500 ids.
- Repo conventions: no `any`; **never run pnpm commands yourself — tell the user which command to run and wait.**

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | all pass (if plan 001 landed) |

## Scope

**In scope**:
- `lib/gmail/sync.ts`

**Out of scope** (do NOT touch):
- `components/sync-results-sheet.tsx` — if it breaks on empty `from`/`subject`, STOP and report instead of editing it.
- The Gmail list-query logic above line 255, parser dispatch, Gemini fallback, subscription auto-detection inside the loop.
- `hooks/use-gmail-sync.ts` / `use-refresh.ts` callers.

## Git workflow

- Branch: `advisor/004-gmail-dedup-before-fetch`
- Commit style: `perf(gmail-sync): batch dedup check before message fetch so re-syncs skip downloaded mail`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Batch-load existing gmail_message_ids

After the `if (messages.length === 0)` early return (`sync.ts:255-261`) and before the `for (const message of messages)` loop, add:

```ts
// Batch dedup: look up which of these message ids are already in the DB so
// duplicates are skipped before paying a per-message Gmail fetch. Chunked —
// SQLite caps bound parameters.
const existingIds = new Set<string>();
const allIds = messages.map((m) => m.id);
for (let i = 0; i < allIds.length; i += 500) {
  const chunk = allIds.slice(i, i + 500);
  const rows = await db
    .select({ gmail_message_id: transactions.gmail_message_id })
    .from(transactions)
    .where(inArray(transactions.gmail_message_id, chunk));
  for (const r of rows) {
    if (r.gmail_message_id) existingIds.add(r.gmail_message_id);
  }
}
```

Add `inArray` to the existing drizzle-orm import in this file.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Skip duplicates at the top of the loop, before the fetch

At the start of the loop body (before the `fetch`), add:

```ts
if (existingIds.has(message.id)) {
  result.skipped++;
  result.emailLogs.push({
    id: message.id,
    from: "",
    subject: "Already synced",
    parsedBy: PARSED_BY.REGEX,
    status: EMAIL_LOG_STATUS.DUPLICATE,
  });
  continue;
}
```

Then **remove** the old post-fetch dedup block (`const existing = await db...` through its `continue`, `sync.ts:283-299`). Keep the `EmailLog` shape unchanged — only the values for `from`/`subject` differ for duplicates. First read how `components/sync-results-sheet.tsx` renders DUPLICATE rows; if an empty `from` renders as something broken (e.g. blank required field), use a sensible constant string instead — but do not edit the sheet.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n "gmail_message_id, message.id" lib/gmail/sync.ts` → no per-message dedup select remains inside the loop.

### Step 3: Operator smoke test

Ask the operator to run a Gmail sync twice in the app (gmail-sync screen → Sync Now). First run: normal counts. Second run: all messages reported as duplicates, and noticeably faster (no per-message downloads).

**Verify**: operator confirms duplicate counts match the first run's added+skipped total and the results sheet renders correctly.

## Test plan

The loop is network+db coupled; no unit tests required for this change. If plan 001 landed, run `pnpm test` to confirm nothing regressed. The two-sync operator check in step 3 is the behavioral gate.

## Done criteria

- [ ] Dedup happens via one batched (chunked) query before any `?format=full` fetch
- [ ] No `db.select` on `gmail_message_id` remains inside the message loop
- [ ] `pnpm typecheck` and `pnpm lint` exit 0
- [ ] Operator two-sync smoke test passed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live loop no longer matches the excerpt (drift since `20fc794`).
- `components/sync-results-sheet.tsx` crashes or renders unusably with the new duplicate log entries — report what it expects.
- You find the same `message.id` can legitimately appear twice in `messages` with different content (would make the Set dedup wrong) — report the list-query logic that causes it.

## Maintenance notes

- If a future change adds new sources of `gmail_message_id` writes mid-sync (e.g. parallel sync), the pre-computed `existingIds` Set could go stale within a run; the in-loop insert path should keep whatever uniqueness guard it has.
- Reviewer: check chunk size and that the `inArray` import didn't shadow anything; confirm `skipped` counting semantics are unchanged (one increment per duplicate message).
- Deferred (rejected for now): batching the Gmail body fetches themselves via the Gmail batch API — bigger win possible but a heavier change with auth/format edge cases.

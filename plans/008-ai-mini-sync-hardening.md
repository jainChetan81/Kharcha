# Plan 008: AI parsing and mini-sync pipeline hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- lib/mini-sync.ts hooks/use-mini-sync.ts hooks/use-refresh.ts hooks/use-transactions.ts lib/gemini/client.ts app/_layout.tsx`
> If any of these files changed since this plan was written, re-read the
> affected file in full and reconcile the line numbers/excerpts below before
> proceeding; if a function this plan edits no longer matches its excerpt,
> STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (soft coordination note, not a dependency — see "Why this matters")
- **Category**: bug
- **Planned at**: audit-derived, current HEAD

## Why this matters

The mini-sync pipeline (a personal Mac-mini SMS/email parsing service the app pulls from) has one job: never lose a transaction and never duplicate one. Right now it can silently lose transactions in three compounding ways: (1) a row that permanently fails to insert still advances the persisted sync cursor, so the app's default incremental path (launch, foreground, pull-to-refresh) never looks at it again — the only recovery is a non-obvious "Full mini sync" icon button that nothing points the user toward; (2) pull-to-refresh, the one automatic path with a plausible route to a toast, shows nothing at all when a sync fails completely (0 added, N failed) — a code comment in `app/_layout.tsx` claims pull-to-refresh "will surface any persistent error with a toast," which is not true for this case; (3) three of the sync entry points (launch/foreground, pull-to-refresh, manual full-sync) each spin up an independent `useMiniSync()` mutation with no shared lock, so two can genuinely overlap (e.g. the app foregrounds and the user immediately pulls to refresh) and race on reading/writing the same persisted cursor.

Two smaller trust-boundary gaps sit next to this: the mini API's HTTP response is cast with `as` and never validated, unlike the Gemini response two files over in the same subsystem, which is fully zod-validated; and `resolveInrAmount()` in the Gemini client compares `currency` case-sensitively, so a non-canonical-case code like `"Usd"` silently defeats both the INR fast path and the FX fallback table — the exact bug class a table comment two lines above says a 2026-07-17 audit already found 23 instances of. A third, smaller reliability gap: Gemini's one automatic retry has no backoff, so a 429 (which by definition means "slow down") gets retried immediately.

Finally there's duplication and dead code: "is mini sync configured" is hand-copied in four places (one with a subtly different `Boolean()` variant), "is mini sync enabled" is implemented twice with different null/undefined semantics for "unset" (`getConfig()` returns `null`, `getAllConfig()`-derived lookups return `undefined`), a detailed per-row diagnostic log is built on every sync and read by nobody, and a `setLastId()` cursor-override function is exported and never wired to any UI.

**Coordination note (not a dependency)**: this plan's step 3 touches `app/_layout.tsx`'s `ForegroundMiniSync` component (currently lines 113-141). A separate initiative (audit bucket "boot sequence failure fallback") is expected to touch the same file's root `useEffect` boot chain (currently lines 174-194, the `initDB().then(...)` block) — a different function in the same file. The two should not conflict, but whichever lands second should rebase past the other rather than resolving line-shifted merge conflicts blind.

## Current state

- `lib/mini-sync.ts:121-278` — `syncMiniTransactions`, the whole sync loop. Key excerpts:
  - Cursor read once at entry (lines 131-135):
    ```ts
    const cursorRaw = await getConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID);
    const storedCursor = cursorRaw ? Number(cursorRaw) : null;
    if (cursorRaw && !Number.isFinite(storedCursor)) {
      throw new Error("Invalid mini sync cursor");
    }
    ```
  - The per-row catch block (lines 242-256) increments `result.failed` and logs, but does **not** `continue` — execution falls through to the unconditional cursor bump:
    ```ts
    } catch (err) {
      logFirebaseError(err, { ... });
      result.failed++;
      result.logs.push({ miniId: row.id, merchant: row.merchant, status: "failed", reason: String(err).slice(0, 200) });
    }

    maxSeenId = Math.max(maxSeenId, row.id);   // ← line 258, runs for failed rows too
    ```
  - The persist check compares against the entry-time snapshot, not a live re-read (lines 261-266):
    ```ts
    if (maxSeenId > (storedCursor ?? 0)) {
      await updateConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID, String(maxSeenId));
    }
    ```
  - `fetchMiniTransactions` (lines 84-119) blindly casts the response:
    ```ts
    return (await response.json()) as { transactions: MiniTransaction[] };   // ← line 115
    ```
  - `isConfigured` is unexported (lines 68-70):
    ```ts
    function isConfigured(): boolean {
      return Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
    }
    ```
  - `MiniSyncResult`/`MiniSyncLog` (lines 23-36) — `logs` is populated at 5 call sites (168, 186, 208, 237, 250) and never read outside this file.
  - `MiniTransaction` interface (lines 51-62) — the shape the blind cast above assumes.

- `hooks/use-mini-sync.ts` — `useMiniSyncConfig` (lines 8-52):
  - Re-implements "configured" (line 23): `const configured = Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);`
  - Derives "enabled" from `getAllConfig()`'s cache, where an unset key is `undefined` (lines 24-29):
    ```ts
    const enabledFlag = raw?.[CONFIG_KEYS.MINI_SYNC_ENABLED];
    const enabled = enabledFlag === "1" || (enabledFlag === undefined && configured);
    ```
  - `setLastId` (lines 39-44) is defined and returned (line 50) but has zero callers anywhere in the repo (verified via `grep -rn "setLastId(" hooks app components lib` — only the definition matches).
  - Only `enabled` is ever destructured by a caller (`app/index.tsx:275`, `hooks/use-refresh.ts:35`) — `lastId` and `setEnabled` are also unread today, but neither was flagged by the audit and both look like near-term settings-UI scaffolding, not orphaned recovery code; leave them alone (see Scope).

- `hooks/use-refresh.ts:72-88` — `useSyncRefresh`'s mini-sync task only toasts on success:
  ```ts
  const result = await miniSync.mutateAsync();
  if (result.result.added > 0) {
    showSuccessToast("Mini synced", formatMiniSyncResult(result.result));
  }
  // no else — an all-failed sync (added: 0, failed: N) produces no toast
  ```
  `formatMiniSyncResult` (lines 21-30) already renders failed counts (`if (result.failed > 0) parts.push(...)`) — it's just never called on this branch.

- `app/_layout.tsx` — `ForegroundMiniSync` (lines 113-141) re-implements both checks inline:
  ```ts
  const configured = Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);   // line 120-121
  if (!configured) return;
  const enabledFlag = await getConfig(CONFIG_KEYS.MINI_SYNC_ENABLED);            // line 123, null when unset
  if (enabledFlag !== "1" && enabledFlag !== null) return;                       // line 124
  runMiniSync();
  ```
  The comment at lines 126-129 ("Fail silently — foreground sync is best-effort; pull-to-refresh will surface any persistent error with a toast") is the claim step 2 below makes true.

- `hooks/use-transactions.ts:405-411` — a fourth variant, missing `Boolean()`:
  ```ts
  if (
    isManualEntry &&
    isPushableType &&
    env.MINI_API_URL &&
    env.MINI_API_TOKEN &&
    variables.merchant
  ) {
  ```
  Already imports `pushTransactionToMini` from `@/lib/mini-sync` (line 45) and `env` from `@/lib/env` (line 43) — `env` has no other use in this file.

- `lib/gemini/client.ts`:
  - `resolveInrAmount` (lines 390-401) compares case-sensitively:
    ```ts
    if (parsed.currency === "INR") return parsed.amount;      // line 396
    if (parsed.amount_inr !== null) return parsed.amount_inr; // line 397
    const rate = FALLBACK_FX_RATES[parsed.currency];           // line 398
    if (!rate) return parsed.amount;                            // line 399
    ```
    The response schema's `currency` field has no `enum` (line 89: `currency: { type: "STRING" }`), unlike `type`/`source`/`confidence`, and the zod schema is just `z.string().min(1)` (line 123) — nothing enforces uppercase.
  - `callGemini` (lines 200-213) retries once, immediately, with no delay:
    ```ts
    const first = await callGeminiOnce<T>(userContent, schema);
    if (first.error && TRANSIENT_ERRORS.includes(first.error)) {
      return callGeminiOnce<T>(userContent, schema);   // line 210 — no delay, incl. RATE_LIMITED
    }
    ```
  - `GEMINI_ERROR.RATE_LIMITED` is `"rate_limited"` (`lib/constants.ts:340`); `TRANSIENT_ERRORS` includes it (`lib/gemini/client.ts:169-173`).

- Repo conventions in play: no `any`; zod for external input validation (already the pattern for the Gemini response, `lib/gemini/client.ts:120-141`); `EXPO_PUBLIC_*` env vars only via literal `process.env.EXPO_PUBLIC_FOO` access (`lib/env.ts`); **never run pnpm commands yourself — tell the operator which command to run and wait for the result.**

## Commands you will need

| Purpose    | Command             | Expected on success                     |
|------------|---------------------|------------------------------------------|
| Typecheck  | `pnpm typecheck`    | exit 0                                    |
| Lint       | `pnpm lint`         | exit 0                                    |
| Quality    | `pnpm quality`      | exit 0 (lint + typecheck)                |
| Dead code  | `pnpm dead-code`    | no new findings (catches orphaned exports/removed fields) |

There is no test runner configured in this repo (`package.json` has no `test` script, no vitest/jest config) — verification is typecheck/lint/dead-code plus the manual checks called out per step.

## Scope

**In scope**:
- `lib/mini-sync.ts` (cursor bookkeeping, lock, response validation, exported `isConfigured`/`deriveMiniSyncEnabled`, `MiniSyncLog`/`setLastId` removal)
- `hooks/use-mini-sync.ts` (`useMiniSyncConfig`, `setLastId` removal, step 6's invalidation swap)
- `hooks/use-gmail-sync.ts` (step 6's invalidation swap ONLY — this file's sync logic is otherwise a different initiative's territory, see below)
- `hooks/use-refresh.ts` (`useSyncRefresh`'s mini-sync toast branch only)
- `hooks/use-transactions.ts` (the `isConfigured` call site only, lines ~405-411)
- `app/_layout.tsx` (`ForegroundMiniSync` only — not the boot `useEffect`, see coordination note above)
- `lib/gemini/client.ts` (`resolveInrAmount`, `callGemini` retry)

**Out of scope** (do NOT touch):
- `app/index.tsx`'s "Full mini sync" button and `handleMiniFullSync` — unchanged by this plan. Note for the record: it always shows a *success* toast on completion regardless of `result.failed`, which has the same "wrong signal" flavor as the pull-to-refresh bug this plan fixes in step 2, but it was not in the assigned findings and the button isn't silent (it always toasts something) — flagging, not fixing.
- `useMiniSyncConfig`'s `lastId` and `setEnabled` — both unread today by any caller, same as `setLastId`, but neither was flagged by the audit; leave them for a future settings screen to pick up.
- `app/_layout.tsx`'s boot `useEffect` (`initDB().then(...)`, lines ~174-194) — a different initiative's territory (see coordination note).
- `lib/gmail/sync.ts` — the actual Gmail parsing/fetch pipeline (a parallel sync pipeline with some of the same smells around cursors/retries) is a different initiative's territory; only `hooks/use-gmail-sync.ts`'s invalidation-list duplication (step 6) is this plan's business, not its sync logic.
- Building any new settings/debug UI for cursor recovery — step 5 removes `setLastId` rather than wiring it (justified there).

**Correction to an earlier draft of this plan**: finding index 42 (mini-sync/gmail-sync hand-rolled cache invalidation duplicating `useInvalidateTransactions`) was initially left out of scope by mistake — a drafting-prompt gap, not a real reason to exclude it. It's back in scope as Step 6.

## Git workflow

- Branch: `fix/008-ai-mini-sync-hardening`
- Commit per step or squash by logical group; style: `fix(mini-sync): stop skipping failed rows past the sync cursor`, `fix(mini-sync): add cross-invocation lock`, `fix(mini-sync): surface full-failure toast on pull-to-refresh`, `refactor(mini-sync): share isConfigured/isEnabled checks`, `fix(mini-sync): validate mini API response shape`, `fix(gemini): normalize currency case, back off before retrying rate limits`, `chore(mini-sync): drop unread diagnostics log and unwired setLastId`, `refactor(sync): share transaction-cache invalidation instead of duplicating it`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix cursor bookkeeping — don't skip past failed rows, and serialize concurrent syncs

Two changes to `lib/mini-sync.ts`, both about the same cursor's correctness:

**1a — cap the persisted cursor below the first failure.** Add a `firstFailedId` tracker next to `maxSeenId` (before the `for (let page ...)` loop):

```ts
let maxSeenId = cursor ?? 0;
// Set on the first row that fails this run (bad shape in step 4, or a
// genuine insert error) and never overwritten after that.
let firstFailedId: number | null = null;
```

In the catch block (currently lines 242-256), add one line so a failure is remembered without changing anything else about it:

```ts
} catch (err) {
  logFirebaseError(err, { ... });   // unchanged
  result.failed++;
  result.logs.push({ ... });         // unchanged (removed in step 5)
  if (firstFailedId === null) firstFailedId = row.id;
}
```

Leave the unconditional `maxSeenId = Math.max(maxSeenId, row.id);` (line 258) exactly as is — it still drives in-run paging (`cursor = maxSeenId` at the end of each page), so a failure doesn't stall the *walk* through this run's pages. What changes is what gets **persisted**. Replace the persist block (currently lines 261-266):

```ts
if (maxSeenId > (storedCursor ?? 0)) {
  await updateConfig(CONFIG_KEYS.MINI_SYNC_LAST_ID, String(maxSeenId));
}
```

with:

```ts
// Persist the cursor after every page so an interrupted sync resumes where
// it left off instead of refetching processed rows. Never move it backwards
// — a full sync starts below the stored cursor by design. Cap it below the
// first row that failed this run so a permanently-broken row gets retried by
// the next incremental sync instead of being silently skipped forever — rows
// after it stay safe to skip on retry (they're re-deduped, not re-inserted).
const persistCandidate =
  firstFailedId !== null ? Math.min(maxSeenId, firstFailedId - 1) : maxSeenId;
if (persistCandidate > (storedCursor ?? 0)) {
  await updateConfig(
    CONFIG_KEYS.MINI_SYNC_LAST_ID,
    String(persistCandidate),
  );
}
```

**1b — add a cross-invocation lock.** `ForegroundMiniSync`, `useSyncRefresh`, and the manual full-sync button each call `syncMiniTransactions()` through independent `useMiniSync()` mutations with no shared coordination. Serialize at the module level (React Native's JS runs on one thread, so this covers every caller in the app). Wrap the exported function around a renamed inner function:

```ts
let inFlightSync: Promise<MiniSyncResult> | null = null;

export function syncMiniTransactions(options?: {
  full?: boolean;
}): Promise<MiniSyncResult> {
  if (inFlightSync) return inFlightSync;
  inFlightSync = withTrace("mini_sync", () => runMiniSync(options)).finally(
    () => {
      inFlightSync = null;
    },
  );
  return inFlightSync;
}

async function runMiniSync(options?: {
  full?: boolean;
}): Promise<MiniSyncResult> {
  // body is the existing content of the `withTrace` callback, unchanged
  // apart from 1a above — starts with `if (!isConfigured()) { ... }`
}
```

This also resolves the "stale `storedCursor` snapshot" half of the race: with only one sync ever in flight, `storedCursor` (read once at the top of `runMiniSync`) can no longer be invalidated by a second run writing over it mid-flight, because there is no second run until the first one's `.finally` clears the lock.

**Verify**: `pnpm typecheck` → exit 0. Manually trace: a row that throws inside `insertTransaction` no longer allows the persisted cursor to pass its id (re-read the new persist block and confirm `persistCandidate` is capped). `grep -n "let inFlightSync" lib/mini-sync.ts` → one match; `grep -n "export function syncMiniTransactions\|async function runMiniSync" lib/mini-sync.ts` → both present.

### Step 2: Surface a toast when pull-to-refresh's mini sync fully fails

In `hooks/use-refresh.ts`, inside `useSyncRefresh`'s mini-sync task (currently lines 74-86), add an `else if` branch:

```ts
const result = await miniSync.mutateAsync();
if (result.result.added > 0) {
  showSuccessToast("Mini synced", formatMiniSyncResult(result.result));
} else if (result.result.failed > 0) {
  // Every processable row failed this run — added stayed 0 so the success
  // branch above never fires. Without this, a fully-failed sync produced no
  // user-visible signal at all on the one path meant to surface it (see the
  // now-true claim in app/_layout.tsx's ForegroundMiniSync comment).
  showErrorToast("Mini sync issues", formatMiniSyncResult(result.result));
}
```

Leave the case where `added === 0 && failed === 0` (nothing new, nothing broken) silent — that's the common "already up to date" case and should stay quiet.

**Verify**: `pnpm typecheck` → exit 0. `grep -n "result.result.failed" hooks/use-refresh.ts` → one match in the new branch.

### Step 3: Consolidate the duplicated "is configured" / "is enabled" checks

Export the existing `isConfigured` from `lib/mini-sync.ts` (just add `export` to line 68) and add one new exported helper next to it that owns both "unset" shapes so the enable rule can't drift between call sites again:

```ts
export function isConfigured(): boolean {
  return Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
}

// Shared by the settings hook (reads getAllConfig()'s cache, where an unset
// key comes back `undefined`) and the boot-time foreground sync (reads
// getConfig() directly, where an unset key comes back `null`) — one function
// owns both "unset" shapes so the enable rule can't silently diverge between
// the two call sites again.
export function deriveMiniSyncEnabled(
  configured: boolean,
  enabledFlag: string | null | undefined,
): boolean {
  if (enabledFlag === "1") return true;
  if (enabledFlag === undefined || enabledFlag === null) return configured;
  return false;
}
```

Then update the four call sites:

- `hooks/use-mini-sync.ts` — replace lines 23-29 with:
  ```ts
  const configured = isConfigured();
  const enabledFlag = raw?.[CONFIG_KEYS.MINI_SYNC_ENABLED];
  const enabled = deriveMiniSyncEnabled(configured, enabledFlag);
  ```
  Import `deriveMiniSyncEnabled, isConfigured` from `@/lib/mini-sync` (it already imports `syncMiniTransactions` from there). Remove the now-unused `import { env } from "@/lib/env";` (line 4) — `env` has no other use in this file after this change.

- `app/_layout.tsx` — replace lines 120-124 (`ForegroundMiniSync`'s body) with:
  ```ts
  const configured = isConfigured();
  if (!configured) return;
  const enabledFlag = await getConfig(CONFIG_KEYS.MINI_SYNC_ENABLED);
  if (!deriveMiniSyncEnabled(configured, enabledFlag)) return;
  ```
  Add `import { deriveMiniSyncEnabled, isConfigured } from "@/lib/mini-sync";`. Remove the now-unused `import { env } from "@/lib/env";` (line 41) — confirm with `grep -n "env\." app/_layout.tsx` that no other reference remains first.

- `hooks/use-transactions.ts` — replace lines 405-411's condition:
  ```ts
  if (isManualEntry && isPushableType && isConfigured() && variables.merchant) {
  ```
  Add `isConfigured` to the existing `import { pushTransactionToMini } from "@/lib/mini-sync";` (line 45). Remove the now-unused `import { env } from "@/lib/env";` (line 43) — confirm with `grep -n "env\." hooks/use-transactions.ts` first (it should only match the two lines being replaced).

**Verify**: `pnpm typecheck` → exit 0 (catches any leftover unused-import or missing-import mistakes as errors under most tsconfigs, but confirm with lint too). `pnpm lint` → exit 0 (biome flags unused imports). `grep -rn "Boolean(env.MINI_API_URL)" hooks app lib` → zero matches (all four copies replaced).

### Step 4: Validate the mini API response, normalize Gemini's currency, back off before retrying a rate limit

**4a — stop trusting the mini API's shape.** In `lib/mini-sync.ts`, replace the `interface MiniTransaction { ... }` block (lines 51-62) with a zod schema (add `import { z } from "zod";` to the top of the file):

```ts
const miniTransactionSchema = z.object({
  id: z.number(),
  type: z.enum(["income", "expense"]),
  amount: z.number(),
  merchant: z.string(),
  category: z.string().nullable(),
  date: z.string(),
  parsedBy: z.enum(["regex", "openrouter", "failed", "manual"]),
  referenceNumber: z.string().nullable(),
  accountLast4: z.string().nullable(),
  bankName: z.string().nullable(),
});

type MiniTransaction = z.infer<typeof miniTransactionSchema>;

const miniApiEnvelopeSchema = z.object({
  transactions: z.array(z.unknown()),
});
```

Change `fetchMiniTransactions`'s return type from `Promise<{ transactions: MiniTransaction[] }>` to `Promise<unknown[]>`, and replace the blind cast (line 115):

```ts
const json: unknown = await response.json();
const envelope = miniApiEnvelopeSchema.safeParse(json);
if (!envelope.success) {
  throw new Error(
    `Mini sync: malformed response envelope: ${envelope.error.issues.map((i) => i.message).join(", ")}`,
  );
}
return envelope.data.transactions;
```

A malformed envelope is a page-level failure — it throws and propagates out of `syncMiniTransactions` unchanged (same as today's network-error/non-2xx handling). Per-row shape is validated inside the loop instead, so one bad row doesn't reject the whole page. Update the caller (currently `const data = await fetchMiniTransactions(cursor); const rows = data.transactions ?? [];`) to `const rows = await fetchMiniTransactions(cursor);`, and change the row loop's head from `for (const row of rows) { try {` to validate before trusting `row`:

```ts
for (const rawRow of rows) {
  const parsedRow = miniTransactionSchema.safeParse(rawRow);
  if (!parsedRow.success) {
    result.failed++;
    const idGuess =
      typeof rawRow === "object" &&
      rawRow !== null &&
      "id" in rawRow &&
      typeof (rawRow as { id: unknown }).id === "number"
        ? (rawRow as { id: number }).id
        : null;
    logFirebaseError(new Error("Invalid mini transaction row shape"), {
      error_type: ERROR_TYPE.SYNC,
      operation: "mini_sync",
      stage: "validate_row",
      mini_id: idGuess !== null ? String(idGuess) : "unknown",
    });
    if (idGuess !== null) {
      if (firstFailedId === null) firstFailedId = idGuess;
      maxSeenId = Math.max(maxSeenId, idGuess);
    }
    continue;
  }
  const row = parsedRow.data;

  try {
    // existing per-row body, unchanged — `row` is now the validated object
```

Everything below (the `if (row.parsedBy === MINI_PARSED_BY_FAILED)` branch onward, including step 1's `firstFailedId` line in the catch block) stays as step 1 left it — this step only changes what feeds `row` into that logic.

**4b — normalize currency case in `resolveInrAmount`.** In `lib/gemini/client.ts` (lines 390-401):

```ts
function resolveInrAmount(parsed: {
  amount: number;
  currency: string;
  original_amount: number;
  amount_inr: number | null;
}): number {
  const currency = parsed.currency.trim().toUpperCase();
  if (currency === "INR") return parsed.amount;
  if (parsed.amount_inr !== null) return parsed.amount_inr;
  const rate = FALLBACK_FX_RATES[currency];
  if (!rate) return parsed.amount;
  return Math.round(parsed.original_amount * rate * 100) / 100;
}
```

`FALLBACK_FX_RATES`'s keys (`USD`, `EUR`, `GBP`, `AED`, `SGD`, `AUD`, `CAD`) are already uppercase, so no other change is needed.

**4c — back off before retrying a rate limit.** In `lib/gemini/client.ts`, add a small delay helper and gate it on the specific error that means "slow down" (lines 200-213):

```ts
const GEMINI_RETRY_DELAY_MS = 1_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini<T>(
  userContent: string,
  schema: object,
): Promise<CallResult<T>> {
  if (!env.GEMINI_API_KEY) {
    return errorResult(GEMINI_ERROR.NO_API_KEY, "GEMINI_API_KEY is not set");
  }

  const first = await callGeminiOnce<T>(userContent, schema);
  if (first.error && TRANSIENT_ERRORS.includes(first.error)) {
    // RATE_LIMITED means the server explicitly asked us to slow down —
    // retrying instantly defeats the point. SERVICE_UNAVAILABLE/TIMEOUT keep
    // retrying immediately: a fixed pause won't fix a real outage, and the
    // user is watching a spinner on this flow (see docs/V3_SPEC.md's
    // "fail fast" framing for this same interaction).
    if (first.error === GEMINI_ERROR.RATE_LIMITED) {
      await delay(GEMINI_RETRY_DELAY_MS);
    }
    return callGeminiOnce<T>(userContent, schema);
  }
  return first;
}
```

**Verify**: `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. Manually confirm `FALLBACK_FX_RATES["usd"]` would have missed before this change and `FALLBACK_FX_RATES["USD"]` hits after (`grep -n "FALLBACK_FX_RATES\[currency\]" lib/gemini/client.ts`). `grep -n "GEMINI_RETRY_DELAY_MS" lib/gemini/client.ts` → 2 matches (declaration + use).

### Step 5: Remove the unread diagnostics log and the unwired cursor override

Both are dead code with no current caller (verified via repo-wide grep before writing this plan). Removing is the right call here, not wiring up: the failure case each `MiniSyncLog` entry would explain is already independently reported per-row via `logFirebaseError` in the catch block (step 1) and the new validation branch (step 4a) — `result.logs` only duplicates that for the failed case and adds pure overhead for the added/skipped cases nobody reads. `setLastId` exists as a manual cursor-surgery escape hatch, but step 1 already makes the automatic path self-heal for the scenario it existed for (a failed row now retries on its own); the one case it doesn't cover — a row that fell victim to the *old*, pre-fix cursor-skip bug on a device that already has a stale cursor in production — is exactly what the existing "Full mini sync" button (resets to 0, safe due to per-row dedupe) already handles more safely than an arbitrary manual cursor value would.

In `lib/mini-sync.ts`:
- Remove the `MiniSyncLog` interface (lines 31-36) and the `logs: MiniSyncLog[]` field from `MiniSyncResult` (line 28).
- Remove `logs: []` from `emptyResult()` (line 65).
- Remove all `result.logs.push({ ... })` call sites (5 of them, at the original lines 168, 186, 208, 237, 250 — search for `result.logs.push` to find them all, since step 1/4 may have shifted line numbers).

In `hooks/use-mini-sync.ts`:
- Remove the `setLastId` function (lines 39-44) and its entry in the returned object (line 50, `setLastId,`).

**Verify**: `grep -rn "MiniSyncLog\|result\.logs\|setLastId" lib hooks app components` → zero matches. `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. `pnpm dead-code` → no new findings (confirms nothing else referenced the removed exports).

### Step 6: Share the transaction-cache invalidation list instead of hand-rolling it twice

Addendum, added after the rest of this plan was written and reviewed: audit finding index 42 was present in this plan's source bucket file but got left out of an earlier draft's scope by mistake (a drafting-prompt error, not a finding about the code) — re-verified against current source and it's real, so it belongs here rather than going unaddressed.

`hooks/use-mini-sync.ts`'s sync-success handler and `hooks/use-gmail-sync.ts`'s sync-success handler each hand-roll the identical 7-key `queryClient.invalidateQueries(...)` list — `TRANSACTIONS`, `TRANSACTIONS_PAGINATED`, `MONTHLY_SUMMARY`, `CATEGORY_BREAKDOWN`, `REIMBURSEMENT_SUMMARY`, `TAG_BREAKDOWN`, `TAG_BREAKDOWN_ALL_TIME` — instead of calling the canonical `useInvalidateTransactions()` (`hooks/use-transactions.ts:52-91`), which invalidates those same 7 keys *plus* `MERCHANT_BREAKDOWN`, `TOTAL_MONTHLY_BUDGET`, `MONTHLY_INSIGHTS`, `FILTERED_INSIGHTS`, `HOLDINGS`, and others (confirmed by reading the live helper — it's ~11+ keys, not the ~7 either sync hook covers). Concretely: after a background Gmail or mini sync adds a transaction, the Home screen's budget bar, the Insights screen's filtered view, and Portfolio holdings can all keep showing stale numbers until something else happens to invalidate them (a manual pull-to-refresh on that specific screen, or a cold app restart) — not because the sync failed, but because it only invalidated 7 of the ~11+ caches that actually depend on transaction data.

In `hooks/use-mini-sync.ts`: replace the 7 individual `queryClient.invalidateQueries({...})` calls in the sync-success path with a call to `useInvalidateTransactions()` (import it from `@/hooks/use-transactions`, call the hook at the top of `useMiniSync`/`useMiniSyncConfig` — whichever hook owns the success handler — same as its existing callers in `hooks/use-transactions.ts:386,433,448,462` do it, then invoke the returned function in place of the 7 manual calls).

In `hooks/use-gmail-sync.ts`: same replacement for its matching 7-call block.

**Verify**: `grep -n "useInvalidateTransactions" hooks/use-mini-sync.ts hooks/use-gmail-sync.ts` → present in both; `grep -c "invalidateQueries" hooks/use-mini-sync.ts hooks/use-gmail-sync.ts` → each drops by 7 (only the `CONFIG` invalidation in `use-mini-sync.ts:20`, unrelated to transaction data, should remain as a direct call). `pnpm typecheck` → exit 0.

## Test plan

No test runner exists in this repo, so verification here is typecheck/lint/dead-code plus targeted manual checks per step (called out inline above). If the operator wants to smoke-test end-to-end: with mini-sync configured, force one row to fail (e.g. temporarily rename a required field server-side, or point at a row you know will fail `transactionInputSchema`), run an incremental sync twice, and confirm (a) the failing row's id never becomes the persisted `mini_sync_last_id` and (b) pull-to-refresh shows an error toast instead of nothing on a run where everything fails.

## Done criteria

- [ ] `grep -n "firstFailedId" lib/mini-sync.ts` shows the tracker declared and read in the persist block
- [ ] `grep -n "inFlightSync" lib/mini-sync.ts` shows the module-level lock guarding `syncMiniTransactions`
- [ ] `grep -n "result.result.failed" hooks/use-refresh.ts` shows the new toast branch
- [ ] `grep -rn "Boolean(env.MINI_API_URL)" hooks app lib` → zero matches; `grep -n "export function isConfigured\|export function deriveMiniSyncEnabled" lib/mini-sync.ts` → both present
- [ ] `grep -n "as { transactions: MiniTransaction\[\] }" lib/mini-sync.ts` → zero matches (blind cast gone); `grep -n "miniTransactionSchema\|miniApiEnvelopeSchema" lib/mini-sync.ts` → present
- [ ] `grep -n "toUpperCase" lib/gemini/client.ts` → present in `resolveInrAmount`; `grep -n "GEMINI_RETRY_DELAY_MS" lib/gemini/client.ts` → present
- [ ] `grep -rn "MiniSyncLog\|setLastId" lib hooks app components` → zero matches
- [ ] `grep -n "useInvalidateTransactions" hooks/use-mini-sync.ts hooks/use-gmail-sync.ts` → present in both
- [ ] `pnpm quality` and `pnpm dead-code` clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" no longer matches the live file (line numbers may drift a little from unrelated edits — a genuine STOP is a *body* mismatch, e.g. the catch block or persist logic has already been restructured).
- `syncMiniTransactions` has gained callers outside `hooks/use-mini-sync.ts` since this plan was written (the lock in step 1 assumes it's the sole entry point into the sync loop) — check with `grep -rn "syncMiniTransactions(" --include="*.ts" --include="*.tsx" .` before step 1.
- The mini API's actual response shape doesn't match `miniTransactionSchema` in step 4a in practice (e.g. a legitimate field is sometimes absent) — report the real shape rather than loosening the schema silently.
- Removing `env` imports in step 3 breaks a usage this plan's grep missed — re-grep rather than assuming.

## Maintenance notes

- Any future mini-sync entry point must go through `syncMiniTransactions()` (not a new direct fetch) to stay inside the step-1 lock — this is now a load-bearing invariant, not just style.
- If a settings/debug screen is ever built for the mini pipeline, `isConfigured`/`deriveMiniSyncEnabled` are now the two functions to reuse — do not re-derive either check inline again.
- `setLastId` was removed, not hidden — if a real recovery need resurfaces that "Full mini sync" doesn't cover (e.g. deliberately *skipping* one unrecoverable row without a full resync), reintroduce it deliberately with a confirmation UI, not as a bare exported setter.

# Plan 006: Double-toast error-feedback cleanup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- hooks/use-transactions.ts app/profile.tsx app/subscriptions/index.tsx hooks/use-edit-subscription.ts hooks/use-subscriptions.ts app/config/tags.tsx hooks/use-tags.ts hooks/use-tag-sheets.tsx "app/tag/[id].tsx" components/transaction-form.tsx "app/edit/[id].tsx" hooks/use-add-transaction.ts`
> If any file shows changes, re-read it in full before touching it — line
> numbers below may have shifted. If a cited function's body no longer
> matches its excerpt (not just line-shifted, structurally different), STOP
> and reconcile before editing that site.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f5a9dc9`, 2026-08-01

## Why this matters

**The rule this plan establishes and applies everywhere below: the mutation hook owns `onError` (and, where present, `onSuccess`) toasting. Call sites must not wrap `mutateAsync()` in their own try/catch (or pass a second `onError`/`onSuccess` to `.mutate()`) purely to toast the same outcome again.** A call site MAY still catch — to keep a sheet open, to run cleanup, to report an error from something the hook doesn't cover (e.g. a duplicate-check or a non-mutation async call) — but if the hook already toasts for that failure, the catch must not toast a second time.

`lib/toast.ts:15-24` shows why this is worse than a cosmetic annoyance: `showErrorToast` fires `Haptics.notificationAsync(...Error)` **and** `AccessibilityInfo.announceForAccessibility(...)` on every call, not just the visible `Toast.show`. Every duplicated toast is also a duplicated error buzz and a duplicated VoiceOver announcement — a screen-reader user hears the failure spoken twice.

The audit flagged 6 sites and explicitly warned the pattern recurs in "at least 7+ places" and is likely under-counted. I re-verified all 6 against the current files (all still reproduce exactly as described) and grepped every `mutateAsync`/`.mutate()` call site in `app/`, `hooks/`, and `components/` against its mutation hook's `onSuccess`/`onError` definition. Most of the ~50 call sites I checked are **correctly structured already** — many hooks (`useAddCategory`, `useAddSource`, `useAddHolding`, `useDeleteBudget`, bank mutations in `hooks/use-banks.ts`, cloud-backup mutations, etc.) deliberately have no `onError`, and their call sites correctly own the single toast. Those are out of scope and must not be touched. But I found genuinely duplicated call sites well beyond the 6 seeded findings, across 10 files — see the enumerated Steps below and the "Done criteria" list for the authoritative count (the Steps section is the source of truth; do not re-derive a total from this paragraph). Two of them (Load Sample Data, and the post-insert budget check) are a different flavor — the mutation itself succeeds and a success toast already fired, but something afterward reports failure anyway — those get their own steps because the fix shape differs from "just remove the duplicate catch."

## Current state

### Group A — plain duplicate: hook's `onError` toasts, call site's catch toasts again

- `hooks/use-transactions.ts:447-459` — `useDeleteTransaction`, the shared hook:
  ```ts
  export function useDeleteTransaction() {
    const invalidate = useInvalidateTransactions();
    return useMutation({
      mutationFn: (id: number) => deleteTransaction(id),
      onSuccess: () => { logEvent(FIREBASE_EVENTS.TRANSACTION_DELETED); invalidate(); },
      onError: (err) => { showErrorToast("Transaction failed", err); },
    });
  }
  ```
- `hooks/use-transactions.ts:524-535` — `useSwipeDelete` double-toasts on top of it:
  ```ts
  export function useSwipeDelete() {
    const deleteMutation = useDeleteTransaction();
    return async (item: TransactionRow) => {
      try {
        await deleteMutation.mutateAsync(item.id);
        showSuccessToast("Transaction deleted");
      } catch {
        showErrorToast("Failed to delete");            // ← duplicate + duplicate haptic
      }
    };
  }
  ```
  Used by `app/history.tsx` and `app/tag/[id].tsx` via `onSwipeDelete` — fixing the hook fixes both callers.
- `hooks/use-transactions.ts:461-473` (`useClearAllTransactions`, `onError` at 469-471) and `hooks/use-transactions.ts:475-498` (`useClearTransactionsWithConfirm`, catch at 490-491 `showErrorToast("Failed", err)`) — same shape, used by `app/profile.tsx`'s "Clear All Transactions" row.
- `app/subscriptions/index.tsx:76-90` — `handleDelete`, catch at 85-87 `showErrorToast("Failed", err)`, against `hooks/use-subscriptions.ts:91-100` (`useDeleteSubscription`, `onError` at 96-98, `showErrorToast("Subscription update failed", err)`).
- `hooks/use-edit-subscription.ts:38-68` — `onSubmit` (catch 64-66, `"Failed to update"`) against `useUpdateSubscription` (`hooks/use-subscriptions.ts:76-89`, `onError` 85-87, `"Subscription update failed"`); `hooks/use-edit-subscription.ts:75-89` — `confirmDelete` (catch 84-86, `"Failed to delete"`) against `useDeleteSubscription` again.
- `app/config/tags.tsx` against `hooks/use-tags.ts`'s per-mutation `onError` (all `showErrorToast(TAG_SCOPE_COPY.failedToUpdateTag / .failedToUpdate, err)`):
  - `app/config/tags.tsx:82-95` `handleDelete` (catch 90-92) vs `useDeleteTag` (`hooks/use-tags.ts:179-188`, `onError` 184-186).
  - `app/config/tags.tsx:326-334` add-tag `BottomSheet.onSave` (catch 331-333) vs `useAddTag` (`hooks/use-tags.ts:144-153`, `onError` 149-151).
  - `app/config/tags.tsx:337-353` rename `BottomSheet.onSave` (catch 350-352) vs `useRenameTag` (`hooks/use-tags.ts:155-165`, `onError` 161-163).
  - `app/config/tags.tsx:388-400` — `scheduleMutation.mutate(vars, { onSuccess, onError })` (inside `QuickDurationSheet.onPick`, 384-402), the `onError` at 397-398 (`showErrorToast(TAG_SCOPE_COPY.failedToStart, err)`) duplicates `useScheduleTag`'s own `onError` (`hooks/use-tags.ts:83-95`, `showErrorToast(TAG_SCOPE_COPY.failedToUpdate, err)`). The `onSuccess` override is **not** a duplicate — `useScheduleTag`'s hook-level `onSuccess` only logs analytics and invalidates, so the call-site `onSuccess` is the only place the per-tag success toast is shown. Keep it; remove only `onError`.
  - Note: `app/config/tags.tsx:364-377`, the `TagAppearanceSheet.onSave` catch (`showErrorToast("Failed to update style", err)`), is **correct as-is** — `useUpdateTagAppearance` (`hooks/use-tags.ts:167-177`) has no `onError` of its own, so this is the sole toast. Do not touch it.
- `hooks/use-tag-sheets.tsx` — shared by `app/config/tags.tsx` (via `useTagSheets()`), no other consumer today:
  - `hooks/use-tag-sheets.tsx:32,51-60` — `QuickStartTagSheet.onSubmit`, `addMutation = useScheduleTag()`, catch at 57-58 `showErrorToast(TAG_SCOPE_COPY.failedToStart, err)` vs the hook's own `onError` (`"Failed to update schedule"`) — contradictory text stacked on top of each other.
  - `hooks/use-tag-sheets.tsx:33,73-89` — `TagScheduleSheet.onSubmit`, `updateMutation = useUpdateSchedule()` / `addMutation = useScheduleTag()`, catch at 86-88 `showErrorToast(TAG_SCOPE_COPY.failedToSchedule, err)` vs either hook's own `onError` (`"Failed to update schedule"`).
- `app/tag/[id].tsx:17,269-277` — its own `TagScheduleSheet.onSubmit`, `updateMutation = useUpdateSchedule()`, catch at 274-275 `showErrorToast(TAG_SCOPE_COPY.failedToUpdate, err)` — this one duplicates the **exact same string** as the hook's own `onError`, so today a failed schedule edit here shows "Failed to update schedule" twice back-to-back.
- `components/transaction-form.tsx:121,843-855` — the inline "New Tag" `BottomSheet.onSave`, `addTagMutation = useAddTag()`, catch at 852-853 `showErrorToast("Failed to add tag", err)` vs `useAddTag`'s own `onError` (`"Failed to update tag"`).
- `app/edit/[id].tsx:37-38,71-119` — `handleSubmit`, `updateMutation = useUpdateTransaction(transactionId)`, catch at 116-118 `showErrorToast("Failed to update", err)` vs `useUpdateTransaction` (`hooks/use-transactions.ts:432-445`, `onError` 441-443, `"Transaction failed"`).
- `app/edit/[id].tsx:165-179` — the `onDelete` confirm handler, `deleteMutation = useDeleteTransaction()`, catch at 174-176 `showErrorToast("Failed to delete", err)` vs the same `useDeleteTransaction.onError` cited above.
- `hooks/use-add-transaction.ts:111,283,356-378,400-411` — `handleTransactionSubmit` and `onDupConfirm` both call `commitTransaction`, which calls `insertMutation.mutateAsync(...)` (`insertMutation = useInsertTransaction()`, `hooks/use-transactions.ts:385-430`, `onError` 426-428, `"Transaction failed"`). Both outer catches show `showErrorToast(FAILED_TO_SAVE, err)` (`"Failed to save"`) on **any** error from `commitTransaction`, including insert failures already toasted by the hook.
- `hooks/use-add-transaction.ts:112,380-393` — `handleSubscriptionSubmit` calls `addSubMutation.mutateAsync(value)` (`addSubMutation = useAddSubscription()`, `hooks/use-subscriptions.ts:62-74`, `onError` 70-72, `"Subscription update failed"`), then `processSubscriptions()` and `queryClient.invalidateQueries()`, all under one try/catch that shows `FAILED_TO_SAVE` on any failure — duplicates the hook's toast specifically for insert failures.

### Group B — different flavor: the write succeeded, but the wrong toast fires afterward

- `hooks/use-transactions.ts:537-549` (`useSeedSampleData`) and `app/profile.tsx:248-263` (Load Sample Data row):
  ```ts
  // hooks/use-transactions.ts
  export function useSeedSampleData() {
    const invalidate = useInvalidateTransactions();
    return useMutation({
      mutationFn: seedSampleData,
      onSuccess: () => {
        invalidate();
        showSuccessToast("Sample data seeded");        // ← fires even when seedSampleData resolved `false`
      },
      onError: (err) => { showErrorToast("Sample data failed", err); },
    });
  }
  ```
  ```tsx
  // app/profile.tsx — the same resolved value is branched on again
  onPress={async () => {
    try {
      const seeded = await seedMutation.mutateAsync();
      if (seeded) {
        showSuccessToast("Sample data loaded");
      } else {
        showErrorToast("Data already exists", "Clear all transactions first");
      }
    } catch (err) {
      showErrorToast("Failed to load sample data", err);
    }
  }}
  ```
  `lib/db/index.ts:602-604` — `seedSampleData` resolves `false` (not a rejection) when data already exists: `if (existing.length > 0) return false;`. So tapping "Load Sample Data" with existing data today shows the hook's unconditional **"Sample data seeded"** success toast immediately followed by the screen's **"Data already exists"** error toast — two contradicting toasts for one tap.
- `hooks/use-add-transaction.ts:279-354` — `commitTransaction`. The insert (283-310) and the success toast (322-334) both complete first; the post-insert budget-threshold check runs *after*:
  ```ts
  if (value.type === TRANSACTION_TYPE.EXPENSE && value.categoryId) {
    const budget = await getBudgetForCategory(value.categoryId);       // ← lines 337, 340: raw DB calls, no mutation hook
    if (budget) {
      const yearMonth = value.date.slice(0, 7);
      const spent = await getCategorySpent(value.categoryId, yearMonth);
      const totalSpent = spent + Number(value.amount);
      if (totalSpent >= budget) {
        showErrorToast(`⚠️ ${value.merchant || "Category"} budget exceeded`);
      } else if (totalSpent >= budget * BUDGET_CRITICAL_THRESHOLD) {
        showErrorToast(`⚠️ Approaching ${value.merchant || "category"} budget`);
      }
    }
  }

  setAiParsedBy(null);
  router.back();
  ```
  If `getBudgetForCategory`/`getCategorySpent` throw (DB error), the exception propagates out of `commitTransaction` past `setAiParsedBy(null)`/`router.back()`, into `handleTransactionSubmit`'s or `onDupConfirm`'s outer catch, which shows `"Failed to save"` — even though the insert already committed and `"Transaction added"` already toasted. The user is stranded on the Add screen believing the save failed, and `router.back()` never runs.

### Import bookkeeping this plan must carry

`showErrorToast` is imported alongside `showSuccessToast` in every touched file. After removing the duplicate calls, `showErrorToast` becomes **fully unused** (and must be dropped from the import) in these files — verified by grepping every `showErrorToast` occurrence in each:

- `app/subscriptions/index.tsx` (only use was `handleDelete`'s catch)
- `hooks/use-edit-subscription.ts` (only uses were `onSubmit`'s and `confirmDelete`'s catches)
- `hooks/use-tag-sheets.tsx` (only uses were the two sheets' catches)
- `app/tag/[id].tsx` (only use was the schedule sheet's catch)
- `app/edit/[id].tsx` (only uses were `handleSubmit`'s and `onDelete`'s catches)
- `app/profile.tsx` (only uses were inside the Load Sample Data handler being replaced)

`app/config/tags.tsx` and `components/transaction-form.tsx` each have one *other*, correctly-structured `showErrorToast` call that survives (`TagAppearanceSheet.onSave` at tags.tsx:375; the "Missing fields" validation toast at transaction-form.tsx:896) — do **not** remove those imports.

Repo conventions in play: no `any`; functional components only; **never run pnpm commands yourself — tell the operator which command to run and wait for the result.**

## Commands you will need

| Purpose            | Command                 | Expected on success |
|---------------------|--------------------------|----------------------|
| Typecheck           | `pnpm typecheck`         | exit 0               |
| Lint (incl. unused imports) | `pnpm lint`       | exit 0               |
| Combined gate       | `pnpm quality`           | exit 0               |
| Dead code           | `pnpm dead-code`         | no new findings      |
| React/RN anti-pattern scan (pre-push hook disabled — run manually) | `pnpm react-doctor:diff` | no new findings |

## Scope

**In scope**:
- `hooks/use-transactions.ts` — `useSwipeDelete`, `useClearTransactionsWithConfirm`, `useSeedSampleData`
- `app/profile.tsx` — Load Sample Data handler only
- `app/subscriptions/index.tsx` — `handleDelete` only
- `hooks/use-edit-subscription.ts` — `onSubmit`, `confirmDelete`
- `app/config/tags.tsx` — `handleDelete`, add/rename `BottomSheet.onSave`, `scheduleMutation.mutate` call
- `hooks/use-tag-sheets.tsx` — both sheets' `onSubmit`
- `app/tag/[id].tsx` — the schedule sheet's `onSubmit` only
- `components/transaction-form.tsx` — the inline "New Tag" `BottomSheet.onSave` only
- `app/edit/[id].tsx` — `handleSubmit`, `onDelete` confirm handler
- `hooks/use-add-transaction.ts` — `commitTransaction`, `handleTransactionSubmit`, `onDupConfirm`, `handleSubscriptionSubmit`

**Out of scope** (do NOT touch):
- `app/config/tags.tsx`'s `TagAppearanceSheet.onSave` and `endNowMutation.mutate(...)` calls — already correctly structured (no hook-level toast to duplicate).
- `components/transaction-form.tsx`'s "Missing fields" validation toast (line 896) — unrelated to mutations.
- Any of the ~30 other `mutateAsync`/`.mutate()` call sites verified during research (sources, categories, holdings, budgets, banks, cloud-backup, gmail-sync, mini-sync, app-lock, config) — their hooks deliberately have no `onError`, so the call site owning the toast is correct as-is. Do not add hook-level toasting to these as some kind of "consistency" pass; that would create the exact bug this plan removes.
- `app/subscriptions/index.tsx`'s `toggleMutation.mutate(...)` (Switch `onValueChange`) — no call-site toast today, nothing to fix.
- `hooks/use-transactions.ts`'s `useInsertTransaction`, `useUpdateTransaction` — the hooks themselves are correct; only their duplicating call sites change.
- Toast copy/wording changes beyond what's needed to remove a duplicate (e.g. don't "fix" `TAG_SCOPE_COPY.failedToUpdate`'s generic wording — out of scope).

## Git workflow

- Branch: `fix/006-double-toast-cleanup`
- Commit per step (or squash groups you did together); style: `fix(toasts): stop double-toasting <area>` (e.g. `fix(toasts): stop double-toasting transaction delete/clear-all`, `fix(toasts): stop double-toasting tag mutations`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `hooks/use-transactions.ts` — swipe delete + clear-all

In `useSwipeDelete` (524-535), replace the catch body:
```ts
} catch {
  // useDeleteTransaction's onError already toasted "Transaction failed"
  // (and fired the error haptic) — don't toast again here.
}
```
In `useClearTransactionsWithConfirm` (475-498), replace the catch body the same way — drop the `(err)` binding since it's now unused:
```ts
} catch {
  // useClearAllTransactions's onError already toasted "Transaction failed".
}
```
`showErrorToast` stays imported in this file (used by `useInsertTransaction`, `useUpdateTransaction`, `useDeleteTransaction`, `useSetReimbursementStatus`, and — after Step 2 — still `useSeedSampleData`).

**Verify**: `grep -n "Failed to delete\"\|showErrorToast(\"Failed\"" hooks/use-transactions.ts` → no matches; `pnpm typecheck` → exit 0.

### Step 2: `hooks/use-transactions.ts` + `app/profile.tsx` — Load Sample Data (different flavor)

Move the branch on the seed result into the hook so there's exactly one place deciding which toast fires:
```ts
// hooks/use-transactions.ts
export function useSeedSampleData() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: seedSampleData,
    onSuccess: (seeded) => {
      if (seeded) {
        invalidate();
        showSuccessToast("Sample data seeded");
      } else {
        showErrorToast("Data already exists", "Clear all transactions first");
      }
    },
    onError: (err) => {
      showErrorToast("Sample data failed", err);
    },
  });
}
```
In `app/profile.tsx`, replace the Load Sample Data `Pressable`'s `onPress` (248-263) — no return value or exception is left for the screen to act on, so this becomes fire-and-forget:
```tsx
onPress={() => seedMutation.mutate()}
```
Remove `showErrorToast` from `app/profile.tsx`'s import (line 47) — `showSuccessToast` stays (still used by `handleSaveName`, line 64).

**Verify**: `grep -n "showErrorToast" app/profile.tsx` → no matches; manual check (operator): tap "Load Sample Data" twice in a row — first tap shows one success toast, second tap shows exactly one "Data already exists" toast, never both stacked.

### Step 3: `app/subscriptions/index.tsx` + `hooks/use-edit-subscription.ts` — subscriptions

In `app/subscriptions/index.tsx`'s `handleDelete` (76-90), replace the catch body with a comment-only no-op (same shape as Step 1) and remove `showErrorToast` from the import (line 50) — `showSuccessToast` stays (used at line 84).

In `hooks/use-edit-subscription.ts`, do the same for `onSubmit`'s catch (64-66) and `confirmDelete`'s catch (84-86), and remove `showErrorToast` from the import (line 15) — `showSuccessToast` stays (used at 62 and 82).

**Verify**: `grep -rn "showErrorToast" app/subscriptions/index.tsx hooks/use-edit-subscription.ts` → no matches in either file; `pnpm typecheck` → exit 0.

### Step 4: `app/config/tags.tsx` — delete / add / rename / schedule

Four independent fixes in this one file:
1. `handleDelete` (82-95), catch at 90-92 → comment-only no-op.
2. Add-tag `BottomSheet.onSave` (326-334), catch at 331-333 → comment-only no-op.
3. Rename `BottomSheet.onSave` (337-353), catch at 350-352 → comment-only no-op.
4. `scheduleMutation.mutate(...)` (388-400): delete the `onError` callback (397-398), keep `onSuccess` (395-396) — it's the only place the per-tag success toast is shown:
   ```tsx
   scheduleMutation.mutate(
     {
       name,
       startAt: format(now, DATE_TIME_FORMAT),
       endAt: format(durationEnd(durationKey, now), DATE_TIME_FORMAT),
     },
     { onSuccess: () => showSuccessToast(TAG_SCOPE_COPY.scopeStarted(name)) },
   );
   ```

Do not touch `TagAppearanceSheet.onSave` (364-377) or either `endNowMutation.mutate(...)` call (139-144, 262-268) — all three are already correct. Keep the `showErrorToast` import (still used by `TagAppearanceSheet.onSave` at line 375).

**Verify**: `grep -n "showErrorToast" app/config/tags.tsx` → exactly two matches (the `import { showErrorToast, ... }` line, which stays since the appearance sheet below still needs it, plus the appearance sheet's call at line ~375 — NOT one match, the import line itself contains the string too); `pnpm typecheck` → exit 0.

### Step 5: `hooks/use-tag-sheets.tsx` + `app/tag/[id].tsx` — quick-start / schedule sheets

In `hooks/use-tag-sheets.tsx`, replace both catch bodies (57-59 in `QuickStartTagSheet.onSubmit`, 86-88 in `TagScheduleSheet.onSubmit`) with comment-only no-ops referencing the hooks that already toast (`useScheduleTag` / `useUpdateSchedule`, both in `hooks/use-tags.ts`). Remove `showErrorToast` from the import (line 6) — it becomes fully unused in this file.

In `app/tag/[id].tsx`, replace the schedule sheet's catch (274-275) the same way. Remove `showErrorToast` from the import (line 32) — `showSuccessToast` stays (used at 273).

**Verify**: `grep -rn "showErrorToast" hooks/use-tag-sheets.tsx "app/tag/[id].tsx"` → no matches in either file; `pnpm typecheck` → exit 0.

### Step 6: `components/transaction-form.tsx` — inline "New Tag" sheet

Replace the catch body at 852-853 (inside the New Tag `BottomSheet.onSave`, 843-855) with a comment-only no-op referencing `useAddTag`'s own `onError`. Keep the `showErrorToast` import — the unrelated "Missing fields" validation toast at line 896 still needs it.

**Verify**: `grep -n "showErrorToast" components/transaction-form.tsx` → exactly two matches (the `import` line, kept because the "Missing fields" toast at line ~896 still needs it, plus that line itself — NOT one match); `pnpm typecheck` → exit 0.

### Step 7: `app/edit/[id].tsx` — transaction update / delete

Replace both catch bodies — `handleSubmit`'s at 116-118 and the `onDelete` confirm handler's at 174-176 — with comment-only no-ops referencing `useUpdateTransaction`/`useDeleteTransaction`'s own `onError`. Remove `showErrorToast` from the import (line 25) — `showSuccessToast` stays (used at 114 and 172).

**Verify**: `grep -n "showErrorToast" "app/edit/[id].tsx"` → no matches; `pnpm typecheck` → exit 0.

### Step 8: `hooks/use-add-transaction.ts` — swallow the post-insert budget check (different flavor)

This must land before Step 9 — Step 9 assumes the budget check can no longer throw past `commitTransaction`. Wrap the budget-threshold block (336-350) in its own try/catch so a DB error here can never undo the fact that the transaction already saved and already toasted success, and can never skip `setAiParsedBy(null)`/`router.back()`:

```ts
if (value.type === TRANSACTION_TYPE.EXPENSE && value.categoryId) {
  try {
    const budget = await getBudgetForCategory(value.categoryId);
    if (budget) {
      const yearMonth = value.date.slice(0, 7);
      const spent = await getCategorySpent(value.categoryId, yearMonth);
      const totalSpent = spent + Number(value.amount);
      if (totalSpent >= budget) {
        showErrorToast(`⚠️ ${value.merchant || "Category"} budget exceeded`);
      } else if (totalSpent >= budget * BUDGET_CRITICAL_THRESHOLD) {
        showErrorToast(
          `⚠️ Approaching ${value.merchant || "category"} budget`,
        );
      }
    }
  } catch (error) {
    // Non-critical: the transaction already saved and already showed its
    // own success toast. A budget-check failure must never surface as
    // "Failed to save" or skip the setAiParsedBy/router.back() below —
    // mirrors safeRecomputeHolding's swallow-and-report pattern (lib/db/holdings.ts:183-197).
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "budgetThresholdCheck",
    });
  }
}
```
Add `logFirebaseError, ERROR_TYPE` to the existing `@/lib/firebase` import (currently `import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";`, line 39).

**Verify**: `pnpm typecheck` → exit 0; `grep -n "logFirebaseError" hooks/use-add-transaction.ts` → one usage inside the new catch.

### Step 9: `hooks/use-add-transaction.ts` — stop double-toasting insert failures

With Step 8 landed, the only thing left inside `commitTransaction` that can still throw is `insertMutation.mutateAsync(...)` — already toasted by `useInsertTransaction`'s own `onError`. Update the three call sites so a rejected `commitTransaction` (or `addSubMutation.mutateAsync`) doesn't toast a second time, while errors from things the hook *doesn't* cover (the duplicate check; `processSubscriptions`/`invalidateQueries`) still get exactly one toast:

```ts
async function handleTransactionSubmit(value: TransactionFormValues) {
  const merchant = value.merchant?.trim();
  if (merchant) {
    let isDuplicate: boolean;
    try {
      isDuplicate = await findDuplicateTransaction(
        value.date,
        Number(value.amount),
        merchant,
      );
    } catch (err) {
      showErrorToast(FAILED_TO_SAVE, err);
      return;
    }
    if (isDuplicate) {
      pendingTxRef.current = value;
      setDupSheetVisible(true);
      return;
    }
  }
  try {
    await commitTransaction(value);
  } catch {
    // useInsertTransaction's onError already toasted "Transaction failed".
  }
}

async function onDupConfirm() {
  const value = pendingTxRef.current;
  pendingTxRef.current = null;
  setDupSheetVisible(false);
  if (value) {
    try {
      await commitTransaction(value);
    } catch {
      // useInsertTransaction's onError already toasted "Transaction failed".
    }
  }
}

async function handleSubscriptionSubmit(value: SubscriptionFormSubmitValue) {
  try {
    await addSubMutation.mutateAsync(value);
  } catch {
    // useAddSubscription's onError already toasted "Subscription update failed".
    return;
  }
  try {
    await processSubscriptions();
    await queryClient.invalidateQueries();
    showSuccessToast(
      "Subscription added",
      `Renews on day ${value.billingDays.join(", ")} every month`,
    );
    router.back();
  } catch (err) {
    showErrorToast(FAILED_TO_SAVE, err);
  }
}
```
`showErrorToast` stays imported (used by `handleParsed`'s low-confidence branch, the duplicate-check catch, the budget-check calls, and `handleSubscriptionSubmit`'s second catch).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; manual check (operator): (a) turn off airplane-mode-style DB access is impractical to simulate, so instead temporarily break `insertTransaction` (e.g. throw at the top of `lib/db/index.ts`'s `insertTransaction` in a scratch edit, not committed) and confirm only one "Transaction failed" toast appears, then revert the scratch edit; (b) add a normal transaction with a category that has a budget near its threshold — confirm the budget-warning toast still appears and the screen still navigates back.

## Test plan

No test runner exists in this repo (`pnpm test` is not a defined script) — verification is typecheck/lint plus manual QA per step above. End-to-end manual pass after all steps land:

1. Swipe-delete a transaction with airplane mode / a broken DB path — confirm exactly one error toast + one error haptic (not two).
2. Delete a subscription, rename a tag, add a tag, schedule a tag scope, edit a transaction, delete a transaction from the edit screen — for each, force a failure (or read the code path) and confirm exactly one toast fires.
3. Tap "Load Sample Data" with existing data present — confirm exactly one toast ("Data already exists"), not a success toast followed by an error toast.
4. Add a transaction that pushes a category over budget — confirm both the "Transaction added" toast and the budget-warning toast appear, and the screen navigates back to the previous screen (not stranded on Add).

## Done criteria

- [ ] Every call site edited by Steps 1-9 above no longer shows a second toast/haptic for an outcome its mutation hook already reports (verify against each step's own grep, not a précis count)
- [ ] `grep -rn "showErrorToast" app/subscriptions/index.tsx hooks/use-edit-subscription.ts hooks/use-tag-sheets.tsx "app/tag/[id].tsx" "app/edit/[id].tsx" app/profile.tsx` → no matches in any of the six files
- [ ] `app/config/tags.tsx` and `components/transaction-form.tsx` each retain exactly one (untouched, correct) `showErrorToast` call
- [ ] `useSeedSampleData`'s `onSuccess` branches on the resolved value; `app/profile.tsx`'s Load Sample Data button no longer has its own try/catch/if-else
- [ ] The budget-threshold check in `hooks/use-add-transaction.ts` is wrapped in its own try/catch that reports via `logFirebaseError`, never rethrows
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality` all exit 0
- [ ] `pnpm dead-code` shows no new findings (import cleanup didn't orphan an export)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited hook's `onError`/`onSuccess` body no longer matches its excerpt above (e.g. it now also toasts something new, or the toast was removed) — re-verify before silencing the corresponding call site; blindly removing a call-site toast when the hook no longer toasts would leave a failure with zero feedback.
- Any cited catch block does more than call `showErrorToast` (e.g. it also resets a loading flag or retries) — keep that other logic; only remove the toast call.
- `pnpm lint` reports an unused import in a file not listed under "Import bookkeeping" above — that means the actual `showErrorToast` usage count in that file differs from what's documented here; re-grep the file rather than assuming the import is safe to drop.
- Step 9's manual check shows the budget-warning toast stopped appearing, or the screen stops navigating back after a normal save — that means Step 8's swallow is masking a real regression; re-check the try/catch boundaries rather than adding a broader catch.

## Maintenance notes

- The rule from "Why this matters" is the durable takeaway: when adding a new mutation hook with its own `onError`/`onSuccess` toast, never also wrap that hook's `mutateAsync()` in the calling component's own toasting try/catch. If the call site needs to react to failure for a non-toast reason (closing a sheet, resetting a ref), catch it — just don't call `showErrorToast`/`showSuccessToast` again for the same outcome the hook already reported.
- If a future mutation hook is added without an `onError` (the correct pattern for ~30 other call sites already in this codebase — sources, categories, holdings, budgets, banks, cloud-backup, etc.), the call site owning the toast is correct and should stay that way; don't "fix" those by adding hook-level toasting, and don't flag them again in a future audit pass.
- `lib/toast.ts`'s `showErrorToast`/`showSuccessToast` firing a haptic + accessibility announcement on every call is itself worth remembering next time this class of bug shows up elsewhere — the user-facing cost of a duplicate toast is three duplicated signals, not one.

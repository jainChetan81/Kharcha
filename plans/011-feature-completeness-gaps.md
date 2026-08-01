# Plan 011: Feature-completeness and empty-state gaps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- app/reimbursements.tsx hooks/use-reimbursement-list.ts app/budgets.tsx "app/edit/[id].tsx" "app/holding/[id].tsx" "app/edit-subscription/[id].tsx" app/tag/"[id]".tsx hooks/use-config-item-actions.ts components/ui/query-error-state.tsx app/insights.tsx app/history.tsx lib/db/holdings.ts lib/db/index.ts`
> If any cited file has changed, re-read it and reconcile the excerpts below
> against the current content before editing; STOP if a function this plan
> depends on (`useTransactionsPaginated`, `ScreenHeader`, `EmptyState`,
> `recomputeHoldingFromTransactions`) has been restructured.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: feature-completeness
- **Planned at**: audit-derived, current HEAD

## Why this matters

Kharcha already has a correct, established pattern for the two failure modes
every screen eventually hits: a query that errors (`QueryErrorState`, wired
correctly in `app/history.tsx` and `app/insights.tsx`) and a route param that
resolves to nothing (`app/tag/[id].tsx`'s explicit "not found" branch with a
`ScreenHeader` and back affordance). Six places in the app never adopted
either pattern, so a real failure there is indistinguishable from "no data
yet" or hangs the screen forever:

- **Reimbursements and Budgets** never look at `error` from their queries —
  `useReimbursementList` doesn't even return one — so a DB read failure
  renders the same "nothing here" empty state as a genuinely empty list.
- **Edit Transaction, Holding Detail, and Edit Subscription** render a bare
  `ActivityIndicator` with no header when the id doesn't resolve (deleted
  row, malformed param), and stay that way forever — no back button, no
  message, no native back gesture (the app hides the native header
  app-wide). `app/tag/[id].tsx` handles the identical situation correctly a
  few files over.
- **Category/source reordering** (`useConfigItemActions.move`) fires its
  mutation with no `onError` anywhere in the chain, so a failed reorder is
  silent — no toast, no log, no visual rollback.
- **`QueryErrorState`** itself has no retry affordance, and its `Insights`
  consumer has no pull-to-refresh either, so a failed insights query is a
  dead end until the user navigates away and back.
- **`recomputeHoldingFromTransactions`'s doc comment** promises a manual
  "recompute" button that was never built — the raw function isn't even
  re-exported from `lib/db/index.ts`, so nothing in the UI *could* call it.
  This is a documentation-vs-reality gap, not a missing error state, and is
  handled as an explicit decision point in Step 6.

This plan brings every one of these up to the pattern the app already uses
correctly elsewhere. No new UI pattern is introduced.

## Current state

All excerpts below were re-read from the working tree at plan time; line
numbers are exact as of that read.

- `hooks/use-reimbursement-list.ts:17-32` — the return type has no `error`:
  ```ts
  export type UseReimbursementListReturn = {
    tab: PendingOrReimbursed;
    setTab: (tab: PendingOrReimbursed) => void;
    isPendingTab: boolean;
    pendingCount: number;
    pendingTotal: number;
    reimbursedCount: number;
    reimbursedTotal: number;
    listData: ListItem[];
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isLoading: boolean;
    markReimbursed: (id: number) => Promise<void>;
    markPending: (id: number) => Promise<void>;
  };
  ```
  and line 50-51 discards it:
  ```ts
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTransactionsPaginated(filters);
  ```
  Contrast with the reference pattern in `hooks/use-history-filters.ts:366-373`,
  which destructures `error` from the identical `useTransactionsPaginated`
  call and returns it (line 479).

- `app/reimbursements.tsx:30-44` destructures the hook without `error`, and
  `ListEmptyComponent` (188-203) only branches on `isLoading`:
  ```tsx
  ListEmptyComponent={
    isLoading ? (
      <TransactionSkeleton count={10} />
    ) : (
      <EmptyState
        icon={Receipt}
        title={isPendingTab ? "No pending reimbursements" : "Nothing reimbursed yet"}
        description='Toggle "Reimbursable" on any expense to track it here.'
        inList
      />
    )
  }
  ```
  Compare to `app/history.tsx:306-315`, the reference pattern, which inserts
  an `error ? <QueryErrorState .../> :` branch between loading and empty.

- `app/budgets.tsx:25-26` — no error captured at all:
  ```tsx
  const { data: categories = [] } = useAllCategories();
  const { data: budgets = [] } = useBudgets();
  ```

- `app/edit/[id].tsx:40-48` — bare spinner forever, no header:
  ```tsx
  const { data: transaction, isLoading } = useTransactionById(transactionId);

  if (isLoading || !transaction) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }
  ```
  `useTransactionById` (`hooks/use-transactions.ts:192-198`) is `enabled: !!id`;
  `Number(id)` on an unresolved/malformed param is `NaN`, which is falsy, so
  the query never runs and this branch never exits.

- `app/holding/[id].tsx:31-43` — identical shape:
  ```tsx
  const { data: holding, isLoading } = useHolding(id);
  ...
  if (isLoading || !holding) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }
  ```
  `ScreenHeader` is already imported in this file (used later at line 52) but
  not rendered in this branch.

- `app/edit-subscription/[id].tsx:37-43` — same gap, confirmed during
  verification (the audit surfaced it only as supporting evidence for the
  holding finding, not as its own line item, but it's the identical bug and
  belongs in this plan):
  ```tsx
  if (isLoading || !subscription) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={COLORS.PRIMARY} />
      </View>
    );
  }
  ```
  `ScreenHeader` is **not** imported in this file today.

- `app/tag/[id].tsx:69-88` — the reference pattern, already correct:
  ```tsx
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="small" color={COLORS.PRIMARY} />
      </View>
    );
  }

  if (!stats?.tag.start_date || !stats.tag.end_date) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Tag" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Scope not found. Go back and pick another.
          </Text>
        </View>
      </View>
    );
  }
  ```

- `hooks/use-config-item-actions.ts:42-46` — no error handling on reorder:
  ```ts
  function move(index: number, direction: -1 | 1) {
    const updates = reorder(items, index, direction);
    if (!updates) return;
    reorderMutation.mutate(updates);
  }
  ```
  `handleDelete` two lines above (27-40) already has the `try/catch` +
  `showErrorToast` pattern to copy. `showErrorToast` is already imported
  (line 4).

- `components/ui/query-error-state.tsx` (full file, 29 lines) — no retry prop:
  ```tsx
  export function QueryErrorState({
    title,
    error,
    inList = false,
  }: {
    title: string;
    error: Error;
    inList?: boolean;
  }) {
    useEffect(() => {
      AccessibilityInfo.announceForAccessibility(`${title}. ${error.message}`);
    }, [title, error.message]);

    return (
      <EmptyState
        icon={AlertTriangle}
        title={title}
        description={error.message}
        inList={inList}
      />
    );
  }
  ```
  `EmptyState` (`components/ui/empty-state.tsx`) already accepts `children`
  and renders them in a `mt-3` wrapper — no change needed there.

- `app/insights.tsx:104-110` — the only consumer with no pull-to-refresh
  (confirmed: `grep -n "RefreshControl" app/insights.tsx` returns nothing):
  ```tsx
  {data.error && !data.isLoading ? (
    <View className="mt-12">
      <QueryErrorState title="Couldn't load insights" error={data.error} />
    </View>
  ) : data.hasData ? (
  ```
  `app/subscriptions/index.tsx:55` shows the plain-refresh reference pattern
  (`useRefresh()` + `getRefreshControlProps` on a `ScrollView`, no Gmail
  sync) — the right one to copy here, not `useSyncRefresh` (History/
  Reimbursements pull in Gmail/mini-sync, which Insights has no reason to
  trigger).

- `app/history.tsx:288-292` already has pull-to-refresh via `RefreshControl`
  on its `FlashList`, and its `QueryErrorState` usage (309-314) sits inside
  that same list, so it already has an escape hatch — it just doesn't wire
  the new retry button. Included here for consistency, not because it's
  currently a dead end.

- `lib/db/holdings.ts:81-92` — the doc comment promising a UI that doesn't
  exist:
  ```ts
  /**
   * Recompute a holding's running units, avg_cost, and invested from its
   * linked transactions. Single source of truth — the buy/sell handler calls
   * this after each mutation, and a manual "recompute" button can repair
   * drift caused by edited or deleted transactions.
   * ...
   */
  export async function recomputeHoldingFromTransactions(
    id: number,
  ): Promise<void> {
  ```
  `grep -rn "recomputeHoldingFromTransactions" lib hooks app` shows exactly
  one caller: `safeRecomputeHolding` (`lib/db/holdings.ts:188`). The
  `lib/db/index.ts:2119-2129` holdings re-export block exports
  `safeRecomputeHolding` but not the raw function:
  ```ts
  export {
    addHolding,
    closeHolding,
    deleteHoldingCascade,
    getAllHoldings,
    getHolding,
    getPortfolioSummary,
    getTransactionsForHolding,
    reopenHolding,
    safeRecomputeHolding,
  } from "./holdings";
  ```
  No screen could wire the promised button even if someone tried.

- Repo conventions in play: no `any`; functional components only; NativeWind
  classes only (no inline `style`); TanStack Query for all fetching; screens
  never import `lib/db` directly (`lib/db/holdings.ts` changes in Step 6 stay
  inside the data layer). **Never run pnpm commands yourself — tell the
  operator which command to run and wait for the result.**

## Commands you will need

| Purpose             | Command            | Expected on success |
|----------------------|--------------------|----------------------|
| Typecheck            | `pnpm typecheck`   | exit 0               |
| Lint + format check  | `pnpm lint`        | exit 0               |
| Lint + typecheck     | `pnpm quality`      | exit 0               |
| Dead-code check       | `pnpm dead-code`    | no new findings       |
| Full local CI gate    | `pnpm local-ci`     | exit 0 (run once at the end, not per step) |

(This repo has no `pnpm test` script — verification for this plan is
typecheck/lint plus the manual smoke checks called out per step.)

## Scope

**In scope**:
- `hooks/use-reimbursement-list.ts`, `app/reimbursements.tsx` (Step 1)
- `app/budgets.tsx` (Step 2)
- `app/edit/[id].tsx`, `app/holding/[id].tsx`, `app/edit-subscription/[id].tsx` (Step 3)
- `hooks/use-config-item-actions.ts` (Step 4)
- `components/ui/query-error-state.tsx`, `app/insights.tsx`, `app/history.tsx` (Step 5)
- `lib/db/holdings.ts`, and `lib/db/index.ts` only if the operator picks
  Decision Option A in Step 6

**Out of scope** (do NOT touch):
- `app/tag/[id].tsx` — already correct; it's the reference pattern, read-only.
- `app/subscriptions/index.tsx` — already correct; read-only reference for
  the `useRefresh` pull-to-refresh pattern in Step 5.
- `hooks/use-history-filters.ts` — already correct; read-only reference for
  the `error` plumbing pattern in Step 1.
- `useReimbursementSummary`'s own error (the Pending/Reimbursed total cards
  at the top of `app/reimbursements.tsx`) — Step 1 surfaces only the
  paginated list query's error, matching History's precedent exactly. Note
  this in your report if you think the summary cards need the same
  treatment; don't silently expand scope.
- Any change to `reorder()` (`lib/reorder.ts`) itself, or to drag-and-drop
  UX — Step 4 only adds failure feedback around the existing call.
  Note: `hooks/use-categories.ts` (`useReorderCategories`) and
  `hooks/use-sources.ts` (`useReorderSources`) are the mutations behind
  `reorderMutation` — do not add `onError` there too; putting it in
  `useConfigItemActions.move` keeps one place responsible for the toast
  across both category and source screens.
- Building the manual-recompute UI (Decision Option A in Step 6) unless the
  operator explicitly says so when they review the decision point — the
  default execution path is Option B (fix the doc comment).
- Any other `QueryErrorState`/bare-spinner instance you notice while working
  that isn't listed above — note it in your report instead of fixing it
  (keeps this plan's diff reviewable against its own scope).

## Git workflow

- Branch: `fix/011-feature-completeness-gaps`
- Commit per step (or squash at the end — operator's call), style:
  `fix(reimbursements): surface fetch errors via QueryErrorState`,
  `fix(edit,holding,edit-subscription): add not-found fallback for unresolved ids`,
  `fix(config): show toast on failed category/source reorder`,
  `feat(query-error-state): add retry action; wire into insights pull-to-refresh`,
  `docs(holdings): correct recomputeHoldingFromTransactions doc comment`
  (last one only if Option B is taken).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Surface fetch errors on Reimbursements

In `hooks/use-reimbursement-list.ts`:
1. Add `error: Error | null;` to `UseReimbursementListReturn` (after `isLoading: boolean;`).
2. Change line 50-51 to also destructure `error`:
   ```ts
   const {
     data,
     fetchNextPage,
     hasNextPage,
     isFetchingNextPage,
     isLoading,
     error,
   } = useTransactionsPaginated(filters);
   ```
3. Add `error,` to the returned object (after `isLoading,`).

In `app/reimbursements.tsx`:
1. Import `QueryErrorState`: `import { QueryErrorState } from "@/components/ui/query-error-state";`.
2. Add `error` to the hook destructure (line 30-44).
3. Change `ListEmptyComponent` to insert an error branch between loading and empty, matching `app/history.tsx:306-315`:
   ```tsx
   ListEmptyComponent={
     isLoading ? (
       <TransactionSkeleton count={10} />
     ) : error ? (
       <QueryErrorState
         title="Couldn't load reimbursements"
         error={error}
         inList
       />
     ) : (
       <EmptyState
         icon={Receipt}
         title={
           isPendingTab
             ? "No pending reimbursements"
             : "Nothing reimbursed yet"
         }
         description='Toggle "Reimbursable" on any expense to track it here.'
         inList
       />
     )
   }
   ```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
(operator): force a query failure (e.g. temporarily rename a column) is
overkill — instead just confirm the screen still renders identically when
there's no error (regression check), since triggering a real DB error
on-device isn't practical to script.

### Step 2: Surface fetch errors on Budgets

In `app/budgets.tsx`:
1. Import `QueryErrorState`: `import { QueryErrorState } from "@/components/ui/query-error-state";`.
2. Capture errors from both queries and combine (mirrors `useInsightsData`'s
   `summary.error ?? breakdown.error ?? ...` pattern):
   ```tsx
   const { data: categories = [], error: categoriesError } = useAllCategories();
   const { data: budgets = [], error: budgetsError } = useBudgets();
   const error = categoriesError ?? budgetsError;
   ```
3. Gate the existing category list on `error`, rendering `QueryErrorState` in
   its place when set. Replace the `<Text className="mb-2 mt-2 ...">Expense
   Categories</Text>` header and the `{expenseCategories.map(...)}` block
   (lines 59-101) with:
   ```tsx
   {error ? (
     <View className="mt-8">
       <QueryErrorState title="Couldn't load budgets" error={error} />
     </View>
   ) : (
     <>
       <Text className="mb-2 mt-2 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
         Expense Categories
       </Text>
       {expenseCategories.map((c) => {
         /* ...unchanged... */
       })}
     </>
   )}
   ```
   (`View` is already imported; no new import needed for the wrapper.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 3: Not-found fallback for unresolved ids

Same fix, three files — split the existing `isLoading || !X` branch into two:
a loading spinner (unchanged) and a distinct not-found branch with a
`ScreenHeader` + message, matching `app/tag/[id].tsx:69-88` exactly.

**`app/edit/[id].tsx`** — add `import { ScreenHeader } from
"@/components/ui/screen-header";` to the imports, then replace lines 42-48:
```tsx
if (isLoading) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={COLORS.PRIMARY} />
    </View>
  );
}

if (!transaction) {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Edit Transaction" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">
          Transaction not found. It may have been deleted.
        </Text>
      </View>
    </View>
  );
}
```

**`app/holding/[id].tsx`** — `ScreenHeader` is already imported. Replace
lines 37-43:
```tsx
if (isLoading) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={COLORS.PRIMARY} />
    </View>
  );
}

if (!holding) {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Holding" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">
          Holding not found. Go back and pick another.
        </Text>
      </View>
    </View>
  );
}
```

**`app/edit-subscription/[id].tsx`** — add `import { ScreenHeader } from
"@/components/ui/screen-header";` to the imports, then replace lines 37-43:
```tsx
if (isLoading) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={COLORS.PRIMARY} />
    </View>
  );
}

if (!subscription) {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Edit Subscription" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">
          Subscription not found. It may have been deleted.
        </Text>
      </View>
    </View>
  );
}
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
(operator): navigate to `/edit/999999`, `/holding/999999`,
`/edit-subscription/999999` (an id that doesn't exist) and confirm each
shows the not-found message with a working back button, instead of spinning
forever.

### Step 4: Error feedback on category/source reorder

In `hooks/use-config-item-actions.ts`, give `move` the same
try/catch-via-mutation-callback treatment `handleDelete` already has:
```ts
function move(index: number, direction: -1 | 1) {
  const updates = reorder(items, index, direction);
  if (!updates) return;
  reorderMutation.mutate(updates, {
    onError: (err) => {
      showErrorToast(`Failed to reorder ${label.toLowerCase()}s`, err);
    },
  });
}
```
`showErrorToast` is already imported. `label` is already a parameter of the
hook ("Category" / "Source"), so the message reads "Failed to reorder
categorys" for the plural-s edge case — check how `label` is used elsewhere
(`handleDelete` line 30 does `${label.toLowerCase()}` with no pluralization)
and either accept the minor grammar wart for consistency with the existing
`handleDelete` copy, or hardcode `"Failed to reorder"` without pluralizing
the label. Prefer the latter (`showErrorToast("Failed to reorder", err)`) —
simpler and avoids "categorys".

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
(operator): with the app running, put the device offline mid-reorder (or
force the mutation to throw), tap a reorder arrow on
`app/config/expense-categories.tsx`, confirm an error toast appears instead
of nothing happening.

### Step 5: Retry action on `QueryErrorState`; wire it into Insights (with pull-to-refresh) and History

In `components/ui/query-error-state.tsx`, add an optional `onRetry` and
render it as a text button when present (mirrors the existing "Clear
filters" affordance style in `app/history.tsx:330-339`):
```tsx
import { AlertTriangle } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable } from "react-native";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/text";

export function QueryErrorState({
  title,
  error,
  inList = false,
  onRetry,
}: {
  title: string;
  error: Error;
  inList?: boolean;
  onRetry?: () => void;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${error.message}`);
  }, [title, error.message]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={title}
      description={error.message}
      inList={inList}
    >
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text className="text-sm font-medium text-primary-text">
            Try again
          </Text>
        </Pressable>
      ) : undefined}
    </EmptyState>
  );
}
```
`onRetry` is optional and backward compatible — existing callers that don't
pass it keep rendering exactly as before.

In `app/insights.tsx`:
1. Add imports: `RefreshControl` to the existing `react-native` import,
   `useRefresh` from `@/hooks/use-refresh`, and `getRefreshControlProps`
   from `@/lib/utils`. Use the plain `useRefresh` (invalidate-only), **not**
   `useSyncRefresh` — Insights has no Gmail/mini-sync reason to trigger a
   sync, unlike History/Reimbursements. `app/subscriptions/index.tsx:26,55`
   is the reference for this exact pairing.
2. `const { refreshing, onRefresh } = useRefresh();` near the top of the
   component.
3. Add `refreshControl={<RefreshControl {...getRefreshControlProps(refreshing, onRefresh)} />}`
   to the outer `ScrollView` (currently `showsVerticalScrollIndicator={false}
   contentContainerStyle={SCROLL_BOTTOM_PADDING}` with no `refreshControl`
   prop).
4. Pass `onRetry={onRefresh}` to the existing `QueryErrorState` usage
   (lines 106-109).

In `app/history.tsx`, pass the same retry wiring for consistency (it already
has pull-to-refresh via its `FlashList`, so this is a convenience addition,
not a dead-end fix): add `onRetry={onRefresh}` to the `QueryErrorState`
usage at lines 310-314 (`onRefresh` is already destructured from
`useSyncRefresh()` at the top of the component).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
(operator): pull down on the Insights screen and confirm the refresh spinner
appears and data reloads; if you can force `data.error` to be set (e.g.
temporarily throw in `getMonthlySummary`), confirm the "Try again" button
appears and re-fetches on tap.

### Step 6 (decision point): `recomputeHoldingFromTransactions` doc comment vs. reality

The function's doc comment (`lib/db/holdings.ts:81-92`) promises "a manual
'recompute' button" that repairs holding-total drift. That button does not
exist, and the raw function isn't even re-exported from `lib/db/index.ts` —
only the auto-run `safeRecomputeHolding` wrapper is. This is a real product
decision, not a mechanical fix — pick one:

- **Option A — build the promised feature.** Re-export
  `recomputeHoldingFromTransactions` from `lib/db/index.ts`'s holdings block
  (alongside `safeRecomputeHolding`), add a mutation hook (e.g.
  `useRecomputeHolding` in `hooks/use-holdings.ts`), and add a "Recompute"
  action to `app/holding/[id].tsx` (e.g. next to the existing Close/Reopen
  button) that calls it and toasts success/failure. This is a genuine new
  UI surface: it needs a decision on placement, confirmation copy (recompute
  is safe and idempotent, so probably no confirm dialog needed, unlike
  delete), and whether it's worth surfacing at all given `safeRecomputeHolding`
  already runs automatically after every mutation — drift should be rare in
  practice.
- **Option B — fix the doc comment to match reality.** Remove the "manual
  recompute button" claim; state plainly that recompute is automatic
  (`safeRecomputeHolding` runs after every buy/sell/delete) and that there is
  currently no manual recovery path if it silently fails.

**Recommendation: Option B.** There's no evidence in this audit bucket (or
in git history) that drift is an observed, recurring problem for users —
`safeRecomputeHolding` already re-derives from the transaction ledger after
every mutation, which is the actual safety net. Building a whole recompute
button for a failure mode that's theoretical (and would itself need product
design work this plan wasn't scoped for) is a bigger commitment than a P3
doc-integrity fix should carry. Default to Option B; only take Option A if
the operator explicitly says so when reviewing this plan.

**Option B implementation** — replace `lib/db/holdings.ts:81-92`:
```ts
/**
 * Recompute a holding's running units, avg_cost, and invested from its
 * linked transactions. Single source of truth — the buy/sell/delete
 * handlers call this (via safeRecomputeHolding) after each mutation, so
 * drift self-corrects automatically. There is currently no manual recovery
 * UI: this function is not re-exported from lib/db/index.ts, and
 * safeRecomputeHolding (the only caller) swallows failures into Crashlytics
 * rather than surfacing them to the user. If drift becomes an observed
 * problem, that's the gap to close — not this comment.
 *
 * Accounting rules:
 *   buy       → units += tx.units; invested += amount; avg_cost = invested/units
 *   sell      → units -= tx.units; invested -= tx.units * avg_cost (cost basis)
 *   dividend  → no unit/cost change; tracked only as cashflow
 *   interest  → same as dividend
 */
```
Also tighten `safeRecomputeHolding`'s doc comment
(`lib/db/holdings.ts:176-182`) — it currently ends with "Portfolio totals
can drift on failure, but the user's transaction is never rolled back
because the holding math choked," which is accurate and can stay as-is; no
change needed there beyond the block above.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (comment-only
change, but confirm nothing else broke). If Option A was taken instead:
`grep -n "recomputeHoldingFromTransactions" lib/db/index.ts` shows it in the
holdings export block, and `pnpm quality` passes.

## Test plan

No automated test suite exists in this repo (`package.json` has no `test`
script). Verification is `pnpm typecheck` + `pnpm lint` after every step,
plus the manual smoke checks called out per step. Run `pnpm quality` once
after all steps land, and `pnpm dead-code` to confirm the new `onRetry` prop
and `QueryErrorState` import in `app/budgets.tsx` don't trip an unused-export
false positive (they shouldn't — both are used immediately).

## Done criteria

- [ ] `grep -n "error" hooks/use-reimbursement-list.ts` shows `error` in both
      the return type and the returned object
- [ ] `app/reimbursements.tsx` and `app/budgets.tsx` both import and render
      `QueryErrorState` when their respective query `error` is set
- [ ] `app/edit/[id].tsx`, `app/holding/[id].tsx`,
      `app/edit-subscription/[id].tsx` each have a distinct not-found branch
      (separate from the loading branch) with a `ScreenHeader` and message
- [ ] `hooks/use-config-item-actions.ts`'s `move` passes an `onError` to
      `reorderMutation.mutate`
- [ ] `components/ui/query-error-state.tsx` accepts an optional `onRetry`
      and renders a button when provided
- [ ] `app/insights.tsx` has a `RefreshControl` on its `ScrollView` and
      passes `onRetry` to its `QueryErrorState`
- [ ] `app/history.tsx` passes `onRetry={onRefresh}` to its `QueryErrorState`
- [ ] `lib/db/holdings.ts`'s doc comment no longer promises a UI that
      doesn't exist (Option B), or the UI now exists and is re-exported
      (Option A) — one of the two, not left as-is
- [ ] `pnpm quality` and `pnpm dead-code` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited function body no longer matches its excerpt above (see Drift
  check).
- `useTransactionsPaginated`'s return shape doesn't include `error` when you
  re-check it (it does today — `hooks/use-transactions.ts`'s
  `useInfiniteQuery` call — but confirm before relying on it in Step 1).
- The operator has an opinion on Step 6 before you reach it — surface the
  decision point and wait rather than defaulting to Option B silently if
  there's any ambiguity about which the operator wants.
- Adding `RefreshControl` to Insights' `ScrollView` conflicts with an
  existing gesture/animation you notice while editing (none is expected —
  `app/subscriptions/index.tsx` does the identical thing on a similar
  screen) — report specifics rather than working around it silently.

## Maintenance notes

- The `error`-from-`useTransactionsPaginated` plumbing pattern
  (`hooks/use-history-filters.ts` → Step 1's `use-reimbursement-list.ts`) is
  now used in three places (History, Reimbursements, and — via
  `useInsightsData`'s multi-query merge — Insights). Any new screen backed
  by a paginated/list query should return `error` from its hook by default,
  not add it later as a follow-up fix.
- `QueryErrorState`'s `onRetry` is opt-in by design — screens where "pull to
  refresh" is already the retry mechanism (History) don't strictly need it,
  but wiring it costs nothing and keeps the component's contract consistent
  across all consumers.
- If Option A is ever picked for Step 6 down the line, the natural spot for
  the button is `app/holding/[id].tsx`, next to the existing Close/Reopen
  `Button` — reuse `useCloseHolding`/`useReopenHolding`'s
  `onSuccess`/`onError` toast pattern rather than inventing a new one.

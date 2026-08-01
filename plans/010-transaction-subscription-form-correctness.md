# Plan 010: Transaction and subscription form correctness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc99..HEAD -- "app/edit-subscription/[id].tsx" app/subscriptions/index.tsx components/transaction-form.tsx components/subscription-form.tsx components/ui/bottom-sheet.tsx app/index.tsx hooks/use-home-data.ts hooks/use-insights-data.ts hooks/use-add-transaction.ts hooks/use-subscriptions.ts hooks/use-edit-subscription.ts components/wrap-stats.tsx`
> If any of these files changed since planning, re-read the affected file(s)
> in full before touching them — several steps quote exact line ranges. If a
> quoted excerpt no longer matches what's on disk (not just shifted line
> numbers — the actual code differs), STOP and report rather than guessing
> at intent.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc99`)

## Why this matters

Eight findings from the full-codebase audit, all landing in the
transaction/subscription form layer. None are data-loss bugs, but each one
is a small correctness or convention gap that degrades the everyday
add/edit-transaction experience or quietly duplicates logic that's already
drifted once:

- The Edit Subscription Amount field uses a bespoke digit-stripping regex
  instead of the shared `sanitizeDecimalInput`, so typing `12.5.6` leaves
  garbage in the field and surfaces a misleading "Amount must be greater
  than 0" error instead of a format error.
- The Edit Subscription screen shows a Category picker for SIP/investment
  subscriptions whose value is silently discarded on save — the user picks
  a category, sees "Subscription updated", and it's gone.
- Two screens reach past the hooks layer into `lib/db/subscriptions`
  directly for pure formatting helpers, violating the documented
  "screens never import `lib/db/` directly" convention.
- `transaction-form.tsx` and `subscription-form.tsx` each hand-roll their
  own `useQuery` for categories/sources with a query-key shape that doesn't
  match the canonical hooks (`useCategoriesByType`/`useAllSources`), so the
  same data is fetched and cached twice under different keys whenever a
  form is mounted alongside another categories-consuming screen.
- `BottomSheet`'s built-in form-mode Save button has no pending state (so
  it's double-tappable into firing `onSave` twice) and no local
  try/catch (so a caller that forgets to guard its own `onSave` produces an
  unhandled promise rejection).
- The Home screen's `getSpendingChangeFlavor` has no branch for an exact 0%
  change, so a month with identical spend to last month renders "↓ 0%" in
  the positive/green color — and the underlying month-over-month percentage
  math is duplicated near-verbatim between `use-home-data.ts` and
  `use-insights-data.ts`, with the two copies already diverged on what
  happens above the display cap.
- `use-add-transaction.ts`'s AI-hint-dismissed config read has no
  `.catch()`, unlike the equivalent read in `use-app-lock.ts`.

All eight were re-verified against the current tree while writing this plan
(commit `f5a9dc99`); none were stale. Exact line numbers are called out per
step below since audit-time numbers can drift by a line or two.

## Current state

### 1. Edit Subscription Amount field — raw regex instead of `sanitizeDecimalInput`

`app/edit-subscription/[id].tsx:119-131`:

```tsx
<Input
  keyboardType="decimal-pad"
  value={field.state.value}
  onChangeText={(v) => {
    field.handleChange(v.replace(/[^0-9.]/g, ""));
  }}
  className="h-14 text-2xl font-bold"
  placeholderTextColor={COLORS.MUTED}
  accessibilityLabel="Amount"
/>
```

`lib/format.ts:54-65` — the shared helper already used by
`transaction-form.tsx:344`, `subscription-form.tsx:161`, and
`investment-fields.tsx:160`:

```ts
// Strips everything except digits and a single decimal point so amount / units
// inputs can't accumulate garbage like "1.2.3" — only the first dot is kept,
// any later ones drop out while typing.
export function sanitizeDecimalInput(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}
```

`lib/validation.ts:10-14` explains the misleading-error part: `"12.5.6"`
survives the raw regex untouched, `Number("12.5.6")` is `NaN`, and the
single `.refine` covers both the NaN case and the `<= 0` case with one
message:

```ts
export const amountStringSchema = z
  .string()
  .min(1, "Amount is required")
  .transform((v) => Number(v))
  .refine((n) => !Number.isNaN(n) && n > 0, "Amount must be greater than 0");
```

### 2. Edit Subscription Category picker discarded for SIPs

`app/edit-subscription/[id].tsx:149-163` renders the picker unconditionally:

```tsx
<form.Field name="categoryId">
  {(field) => (
    <View className="mb-5">
      <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
        Category
      </Text>
      <ChipPicker
        items={categories}
        selectedId={field.state.value}
        onSelect={(id) => field.handleChange(id)}
        allLabel="None"
      />
    </View>
  )}
</form.Field>
```

`lib/db/subscriptions.ts:162-182`, `updateSubscription()` forces
`category_id` to `null` whenever the subscription is an investment type,
regardless of what the form submitted:

```ts
const isInvestment = v.type === "investment";
...
  .set({
    ...
    category_id: isInvestment ? null : v.categoryId,
    ...
  })
```

`hooks/use-edit-subscription.ts:56-61` passes `type: subscription.type`
straight through unchanged — the edit screen has no UI to convert
expense↔investment — so for an investment subscription `isInvestment` is
always `true` server-side and the picker's selection never persists. The
Add flow (`components/subscription-form.tsx:270-360`) already branches on
`type` correctly: it shows Category only for expense subs and Holding /
Default Units for SIPs — the edit screen never replicates that branch. Note
`Subscription["type"]` (from `lib/db/schema.ts:37`) is a real
`"expense" | "investment"` literal union (drizzle `enum` column), so
`subscription.type !== TRANSACTION_TYPE.INVESTMENT` narrows cleanly.

### 3. Screens bypassing the hooks layer for `lib/db/subscriptions` helpers

`app/subscriptions/index.tsx:47`:
```ts
import { formatBillingDays, parseBillingDays } from "@/lib/db/subscriptions";
```
`app/edit-subscription/[id].tsx:18`: same import. `hooks/use-subscriptions.ts:1-25`
re-exports `SubscriptionAuditRow`/`SubscriptionCandidate`/`SubscriptionRow`
and `processSubscriptions` but never `formatBillingDays`/`parseBillingDays`,
so both screens reach past the hook.

### 4. Hand-rolled categories/sources queries duplicating the canonical hooks

`components/transaction-form.tsx:166-175`:
```ts
const { data: categories = [] } = useQuery({
  queryKey: [QUERY_KEYS.CATEGORIES, categoryType],
  queryFn: () => getCategoriesByType(categoryType),
  enabled: !isTransfer && !isInvestment,
});

const { data: sources = [] } = useQuery({
  queryKey: [QUERY_KEYS.SOURCES],
  queryFn: getAllSources,
});
```

`components/subscription-form.tsx:70-78`: the same pattern, keyed on
`TRANSACTION_TYPE.EXPENSE` unconditionally.

`hooks/use-categories.ts:19-31` and `hooks/use-sources.ts:14-20` are the
canonical hooks, already used correctly by
`hooks/use-edit-subscription.ts:26-29`:
```ts
export function useCategoriesByType(
  type: "income" | "expense" | "all",
  enabled = true,
) {
  return useQuery({
    queryKey: [QUERY_KEYS.CATEGORIES, "filter", type],
    queryFn: () => ...,
    enabled,
  });
}
```
```ts
export function useAllSources(enabled = true) {
  return useQuery({ queryKey: [QUERY_KEYS.SOURCES], queryFn: getAllSources, enabled });
}
```
Note the key shape mismatch: the hand-rolled category query key is
`[QUERY_KEYS.CATEGORIES, categoryType]`, the hook's is
`[QUERY_KEYS.CATEGORIES, "filter", type]` — two different cache entries for
the same rows.

### 5. `BottomSheet` Save button has no pending state or local catch

`components/ui/bottom-sheet.tsx:81-86`:
```ts
async function handleSave() {
  if (!props.onSave) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  await props.onSave(trimmed);
}
```
Wired to the Save button at `components/ui/bottom-sheet.tsx:129-140`, whose
`disabled` only checks `!value.trim() || (props.validate ? !props.validate(value) : false)`
— it stays enabled for the whole duration of the `await`, and there's no
`try/catch` around `props.onSave(trimmed)`.

### 6. Duplicated month-over-month math + missing 0%-change branch

`hooks/use-home-data.ts:13-17` and `:59-70`:
```ts
const PERCENT_DISPLAY_CAP = 999;
...
const rawPct =
  prevExpenses > 0
    ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100)
    : null;
const spendingChange =
  rawPct !== null
    ? Math.abs(rawPct) > PERCENT_DISPLAY_CAP
      ? null
      : rawPct
    : expenses > 0
      ? ("new" as const)
      : null;
```

`hooks/use-insights-data.ts:10-13` and `:35-48` — same constant, same
comment, but the capped branch returns `"huge-up"`/`"huge-down"` instead of
`null`:
```ts
const PERCENT_DISPLAY_CAP = 999;
...
const change: InsightsChange =
  rawPct !== null
    ? Math.abs(rawPct) > PERCENT_DISPLAY_CAP
      ? rawPct > 0
        ? "huge-up"
        : "huge-down"
      : rawPct
    : expenses > 0
      ? "new"
      : null;
```

`app/index.tsx:251-263` — the consumer of `use-home-data`'s copy, missing
the 0% branch (falls into the `down`/positive-green branch):
```ts
function getSpendingChangeFlavor(
  value: number | "new" | null,
): { color: string; text: string } | null {
  if (value === null) return null;
  if (value === "new")
    return { color: "text-muted-foreground", text: "First month tracking" };
  if (value > 0)
    return { color: "text-negative-text", text: `↑ ${value}% vs last month` };
  return {
    color: "text-positive",
    text: `↓ ${Math.abs(value)}% vs last month`,
  };
}
```

`components/wrap-stats.tsx:95-118` — the sibling implementation, already
correct, and the reference this step converges on:
```ts
function renderBadge(
  change: InsightsData["change"],
  prevMonthLabel: string,
): Badge {
  if (change === null || change === "new") {
    return { label: "First month tracking", tone: "muted" };
  }
  if (change === "huge-up") {
    return { label: `↑ vs ${prevMonthLabel}`, tone: "up" };
  }
  if (change === "huge-down") {
    return { label: `↓ vs ${prevMonthLabel}`, tone: "down" };
  }
  if (change < 0) {
    return { label: `↓${Math.abs(change)}% vs ${prevMonthLabel}`, tone: "down" };
  }
  if (change > 0) {
    return { label: `↑${change}% vs ${prevMonthLabel}`, tone: "up" };
  }
  return { label: `Same as ${prevMonthLabel}`, tone: "muted" };
}
```
`spendingChange` (from `useHomeData`) and `getSpendingChangeFlavor` are only
consumed inside `app/index.tsx` — confirmed via
`grep -rn "spendingChange\|getSpendingChangeFlavor" --include="*.ts" --include="*.tsx" .` —
so widening `spendingChange`'s type to include `"huge-up"`/`"huge-down"` is
a local, contained change.

### 7. Missing `.catch()` on the AI-hint-dismissed config read

`hooks/use-add-transaction.ts:145-153`:
```ts
useEffect(() => {
  let alive = true;
  getConfig(CONFIG_KEYS.AI_HINT_DISMISSED).then((v) => {
    if (alive) setHintDismissed(v === "1");
  });
  return () => {
    alive = false;
  };
}, []);
```
Reference pattern, `hooks/use-app-lock.ts:50-59`:
```ts
getConfig(CONFIG_KEYS.APP_LOCK_ENABLED)
  .then((value) => {
    if (value === "1") {
      setLocked(true);
      authenticate();
    }
  })
  .catch(() => {
    // Config read failed — don't block the app, leave unlocked.
  });
```

Repo conventions in play throughout: no `any` types; functional components
only; NativeWind classes only; TanStack Query for all data fetching via the
canonical hooks, not hand-rolled `useQuery`; screens never import
`lib/db/` directly; **never run pnpm commands yourself — tell the operator
which command to run and wait for the result.**

## Commands you will need

| Purpose         | Command            | Expected on success |
|------------------|--------------------|----------------------|
| Lint             | `pnpm lint`        | exit 0               |
| Typecheck        | `pnpm typecheck`   | exit 0               |
| Lint + typecheck | `pnpm quality`     | exit 0               |
| Dead code        | `pnpm dead-code`   | no new findings      |

(This repo has no automated test runner script — verification is
typecheck/lint plus the manual smoke checks called out per step and in
"Test plan" below.)

## Scope

**In scope**:
- `app/edit-subscription/[id].tsx`, `hooks/use-edit-subscription.ts`
- `app/subscriptions/index.tsx`
- `hooks/use-subscriptions.ts` (add re-exports only)
- `components/transaction-form.tsx`, `components/subscription-form.tsx`
- `components/ui/bottom-sheet.tsx`
- `app/index.tsx`, `hooks/use-home-data.ts`, `hooks/use-insights-data.ts`,
  `components/wrap-stats.tsx`
- `hooks/use-add-transaction.ts`
- New file: `lib/spending-change.ts`

**Out of scope** (do NOT touch):
- Building full edit UI for an existing SIP's `holding_id` / `default_units`
  / investment kind (the audit noted the edit screen has no way to change
  these at all). Step 2 below only stops the Category picker from lying
  about persisting a value it can't — it does not add new SIP-editing
  fields. That's a bigger feature addition; flag it in your report as a
  candidate follow-up plan if the operator wants full parity with the Add
  flow.
- Any of the ~13 other `BottomSheet` consumers — step 5 changes the shared
  primitive only; do not touch call sites, their existing try/catch blocks
  around `onSave` are still fine (belt-and-suspenders, not redundant).
- Re-theming or restyling the Home/Insights spending-change badges — step 6
  preserves existing copy and colors exactly (including Insights' existing,
  already-correct text), it only removes duplicate logic and fixes Home's
  0% branch.
- `lib/db/subscriptions.ts`, `lib/validation.ts`, `lib/format.ts` — read
  for reference, not modified.

## Git workflow

- Branch: `fix/010-transaction-subscription-form-correctness`
- Commit per step; style: `fix(subscriptions): sanitize edit-subscription amount input`,
  `fix(subscriptions): stop discarding category for SIP edits`,
  `refactor(subscriptions): route billing-day helpers through the hooks layer`,
  `refactor(forms): reuse canonical categories/sources hooks`,
  `fix(ui): guard BottomSheet save against double-tap and unhandled rejection`,
  `fix(insights): unify spending-change math and fix 0%-change color`,
  `fix(hooks): catch AI-hint-dismissed config read`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Sanitize the Edit Subscription amount input

In `app/edit-subscription/[id].tsx`, import `sanitizeDecimalInput` from
`@/lib/format` (add to file's import list) and replace the `onChangeText`
at line 122-124:

```tsx
onChangeText={(v) => {
  field.handleChange(sanitizeDecimalInput(v));
}}
```

**Verify**: `pnpm typecheck` → exit 0. Manual: operator opens an existing
subscription's edit screen, types `12.5.6` into Amount, confirms only
`12.5` remains in the field (matches the Add-flow amount field's
behavior).

### Step 2: Stop rendering a Category picker that SIP edits can't save

In `app/edit-subscription/[id].tsx`:
1. Add `TRANSACTION_TYPE` to the existing `@/lib/constants` import.
2. Wrap the `<form.Field name="categoryId">...</form.Field>` block
   (lines 149-163) in a type check, matching the Add flow's branch in
   `subscription-form.tsx:270-360`:

```tsx
{subscription.type !== TRANSACTION_TYPE.INVESTMENT && (
  <form.Field name="categoryId">
    {(field) => (
      <View className="mb-5">
        <Text className="mb-1.5 text-sm font-medium text-muted-foreground">
          Category
        </Text>
        <ChipPicker
          items={categories}
          selectedId={field.state.value}
          onSelect={(id) => field.handleChange(id)}
          allLabel="None"
        />
      </View>
    )}
  </form.Field>
)}
```

No change needed in `hooks/use-edit-subscription.ts` — `categoryId` is
still submitted for expense subs exactly as before; for investment subs the
field simply no longer renders, so there's nothing left to silently
discard. `subscription.type` is a real `"expense" | "investment"` literal
(drizzle enum column, see `lib/db/schema.ts:37`), so the comparison
narrows without a cast.

**Verify**: `pnpm typecheck` → exit 0. Manual: operator opens an existing
SIP subscription's edit screen and confirms no Category picker is shown
(only Name, Amount, Billing Days [read-only], Source); opens an existing
expense subscription and confirms Category still shows and still saves.

### Step 3: Route billing-day helpers through the hooks layer

In `hooks/use-subscriptions.ts`:
1. Add `formatBillingDays, parseBillingDays,` to the existing named import
   from `@/lib/db/subscriptions` (alongside `addSubscription`,
   `deleteSubscription`, etc.).
2. Update the re-export line near the bottom of the import block:
   ```ts
   // Re-export for imperative calls and pure helpers (screens must not
   // import lib/db/ directly)
   export { processSubscriptions, formatBillingDays, parseBillingDays };
   ```

In `app/subscriptions/index.tsx`: remove the
`import { formatBillingDays, parseBillingDays } from "@/lib/db/subscriptions";`
line (line 47) and add `formatBillingDays, parseBillingDays,` to the
existing multi-line import from `@/hooks/use-subscriptions` (lines 27-37).

In `app/edit-subscription/[id].tsx`: replace the
`import { formatBillingDays, parseBillingDays } from "@/lib/db/subscriptions";`
line (line 18) with
`import { formatBillingDays, parseBillingDays } from "@/hooks/use-subscriptions";`.

**Verify**: `grep -rn "lib/db/subscriptions" app/subscriptions/index.tsx "app/edit-subscription/[id].tsx"` →
no matches. `pnpm typecheck` → exit 0. `pnpm dead-code` → no new findings
(confirms the re-export is actually consumed, not an unused export).

### Step 4: Reuse the canonical categories/sources hooks in the two forms

In `components/transaction-form.tsx`:
1. Remove `getAllSources, getCategoriesByType,` from the `@/lib/db` import
   block (keep `getMostUsedCategoryForMerchant`,
   `getMostUsedSourceForMerchant`, `getMostUsedTagsForMerchant`,
   `searchMerchants`, `type TagLite`).
2. Add `import { useCategoriesByType } from "@/hooks/use-categories";` and
   `import { useAllSources } from "@/hooks/use-sources";`.
3. Replace lines 166-175:
   ```ts
   const { data: categories = [] } = useCategoriesByType(
     categoryType,
     !isTransfer && !isInvestment,
   );
   const { data: sources = [] } = useAllSources();
   ```
   (`categoryType` is already narrowed to `"income" | "expense"` at this
   point via the `isTransfer`/`isInvestment` aliased-condition narrowing at
   line 126-128, so it satisfies `useCategoriesByType`'s parameter type
   without a cast.)
4. `QUERY_KEYS` stays imported — still used by the merchant-suggestions and
   tag-suggestions queries later in the file.

In `components/subscription-form.tsx`:
1. Remove the `import { getAllSources, getCategoriesByType } from "@/lib/db";`
   line entirely.
2. Remove `import { useQuery } from "@tanstack/react-query";` (nothing else
   in this file uses it once the two hand-rolled queries are gone).
3. Trim `QUERY_KEYS` out of the `@/lib/constants` import (nothing else in
   this file uses it).
4. Add `import { useCategoriesByType } from "@/hooks/use-categories";` and
   `import { useAllSources } from "@/hooks/use-sources";`.
5. Replace lines 70-78:
   ```ts
   const { data: categories = [] } = useCategoriesByType(
     TRANSACTION_TYPE.EXPENSE,
   );
   const { data: sources = [] } = useAllSources();
   ```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (catches the
now-unused imports if any were missed). Manual: operator opens Add
Transaction and Add Subscription, confirms category chips and source chips
still populate normally.

### Step 5: Harden `BottomSheet`'s Save button

In `components/ui/bottom-sheet.tsx`:
1. Add `ActivityIndicator` to the `react-native` import.
2. Add `const [isSaving, setIsSaving] = useState(false);` alongside the
   existing `value` state.
3. Replace `handleSave` (lines 81-86):
   ```ts
   async function handleSave() {
     if (!props.onSave) return;
     const trimmed = value.trim();
     if (!trimmed || isSaving) return;
     setIsSaving(true);
     try {
       await props.onSave(trimmed);
     } catch {
       // Consumers are expected to report their own errors (e.g. via
       // showErrorToast) inside onSave. This catch exists only so a
       // consumer that forgets to guard doesn't leave an unhandled
       // promise rejection here.
     } finally {
       setIsSaving(false);
     }
   }
   ```
4. Update the Save `<Button>` (lines 129-140) to reflect pending state:
   ```tsx
   <Button
     className="h-12 flex-1 rounded-xl bg-primary"
     onPress={handleSave}
     disabled={
       isSaving ||
       !value.trim() ||
       (props.validate ? !props.validate(value) : false)
     }
   >
     {isSaving ? (
       <ActivityIndicator color={COLORS.WHITE} />
     ) : (
       <Text className="text-sm font-semibold text-primary-foreground">
         {props.submitLabel}
       </Text>
     )}
   </Button>
   ```
5. In the existing `useEffect` that resyncs `value` on open (lines 71-75),
   also reset `setIsSaving(false)` — a defensive reset in case the sheet is
   ever reopened while a previous save was still technically in flight.

**Verify**: `pnpm typecheck` → exit 0. Manual: operator opens the New Tag
sheet from Add Transaction, taps Save rapidly twice, confirms only one tag
is created and the button shows a spinner instead of staying tappable.

### Step 6: Unify month-over-month spending-change math and fix the 0% bug

Create `lib/spending-change.ts`:

```ts
// Month-over-month spending-change math, shared by the Home screen banner
// and the Insights/Wrap screen. Both consumers compare "this month" vs
// "last month" expenses and need the same sanity cap on the percentage —
// previously each hook hand-rolled its own copy, and the copies had
// already drifted (Home silently hid the badge above the cap; Insights
// showed direction-only instead, and only Insights handled an exact 0%
// change). One copy, one behavior, used by both.

// When the prior month had near-zero spending, the percentage delta
// explodes (e.g. ₹100 → ₹39k = 38900%) and becomes alarmist noise. Cap the
// absolute change we'll display as a number; beyond it, show direction
// only. Currency-agnostic — purely a sanity bound on the rendered number.
export const PERCENT_DISPLAY_CAP = 999;

// `"new"` = no prior data, current > 0. `"huge-up" | "huge-down"` = prior >
// 0 but the delta exceeds PERCENT_DISPLAY_CAP; direction is still
// meaningful even when the exact number isn't worth printing.
export type SpendingChange = number | "new" | "huge-up" | "huge-down" | null;

export function computeSpendingChange(
  current: number,
  previous: number,
): SpendingChange {
  const rawPct =
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  if (rawPct === null) return current > 0 ? "new" : null;
  if (Math.abs(rawPct) > PERCENT_DISPLAY_CAP) {
    return rawPct > 0 ? "huge-up" : "huge-down";
  }
  return rawPct;
}

export type SpendingChangeTone = "up" | "down" | "muted";

// Single source of truth for "is this change good, bad, or a wash" —
// including the exact-0% case, which the Home screen's hand-rolled copy
// used to miss and render in the "down"/positive color.
export function getSpendingChangeTone(
  change: SpendingChange,
): SpendingChangeTone {
  if (change === null || change === "new") return "muted";
  if (change === "huge-up") return "up";
  if (change === "huge-down") return "down";
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "muted";
}
```

In `hooks/use-home-data.ts`: remove the local `PERCENT_DISPLAY_CAP` const
(lines 13-17) and the inline `rawPct`/`spendingChange` computation (lines
59-70); import `computeSpendingChange` from `@/lib/spending-change` and
replace with:
```ts
const spendingChange = computeSpendingChange(expenses, prevExpenses);
```

In `hooks/use-insights-data.ts`: remove the local `PERCENT_DISPLAY_CAP`
const (lines 10-13); import `computeSpendingChange` and `type SpendingChange`
from `@/lib/spending-change`; change the `InsightsChange` type alias (line
17) to `export type InsightsChange = SpendingChange;`; replace the inline
`rawPct`/`change` computation (lines 35-48) with:
```ts
const change: InsightsChange = computeSpendingChange(expenses, prevExpenses);
```

In `app/index.tsx`: import `getSpendingChangeTone` and `type SpendingChange`
from `@/lib/spending-change`; replace `getSpendingChangeFlavor` (lines
251-263) with:
```ts
function getSpendingChangeFlavor(
  value: SpendingChange,
): { color: string; text: string } | null {
  if (value === null) return null;
  if (value === "new")
    return { color: "text-muted-foreground", text: "First month tracking" };
  const tone = getSpendingChangeTone(value);
  if (tone === "muted")
    return { color: "text-muted-foreground", text: "Same as last month" };
  const color = tone === "up" ? "text-negative-text" : "text-positive";
  const arrow = tone === "up" ? "↑" : "↓";
  if (value === "huge-up" || value === "huge-down") {
    return { color, text: `${arrow} vs last month` };
  }
  return { color, text: `${arrow} ${Math.abs(value)}% vs last month` };
}
```
(`spendingChange`'s type is widening from `number | "new" | null` to
include `"huge-up" | "huge-down"` — confirmed via
`grep -rn "spendingChange\|getSpendingChangeFlavor"` that `app/index.tsx`
is the only consumer, so this is contained.)

In `components/wrap-stats.tsx`: import `getSpendingChangeTone` from
`@/lib/spending-change`; replace `renderBadge` (lines 95-118) with:
```ts
function renderBadge(
  change: InsightsData["change"],
  prevMonthLabel: string,
): Badge {
  if (change === null || change === "new") {
    return { label: "First month tracking", tone: "muted" };
  }
  const tone = getSpendingChangeTone(change);
  if (change === "huge-up") return { label: `↑ vs ${prevMonthLabel}`, tone };
  if (change === "huge-down") return { label: `↓ vs ${prevMonthLabel}`, tone };
  if (tone === "muted") return { label: `Same as ${prevMonthLabel}`, tone };
  const arrow = tone === "up" ? "↑" : "↓";
  return { label: `${arrow}${Math.abs(change)}% vs ${prevMonthLabel}`, tone };
}
```
This is behavior-preserving for Insights (same labels, same tones for every
input it could already receive) — it only removes the duplicated
up/down/muted decision so both screens share one implementation.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual: (a)
operator finds or creates a month with identical total expenses to the
prior month, opens Home, confirms the badge reads "Same as last month" in
the muted/gray color, not "↓ 0%" in green; (b) operator opens Insights for
the same month and confirms the Wrap card still reads "Same as <prev
month>"; (c) spot-check a month with an up% and a down% change on both
Home and Insights to confirm copy/colors are unchanged from before this
step.

### Step 7: Catch the AI-hint-dismissed config read

In `hooks/use-add-transaction.ts`, replace lines 145-153:
```ts
useEffect(() => {
  let alive = true;
  getConfig(CONFIG_KEYS.AI_HINT_DISMISSED)
    .then((v) => {
      if (alive) setHintDismissed(v === "1");
    })
    .catch(() => {
      // Config read failed — don't block the app, leave the hint dismissed
      // (the safer default: better to hide a helpful hint than to throw).
    });
  return () => {
    alive = false;
  };
}, []);
```

**Verify**: `pnpm typecheck` → exit 0. No behavior change observable in the
happy path; this only prevents an unhandled rejection if the config read
fails.

## Test plan

No automated test suite exists in this repo (`package.json` has no `test`
script). Verification throughout is `pnpm typecheck` / `pnpm lint` /
`pnpm dead-code` plus the manual checks listed per step. Run the full
manual pass at the end in one sitting: edit an expense subscription (amount
sanitization + category still saves), edit a SIP subscription (no category
picker, other fields still save), open Add Transaction and Add Subscription
(categories/sources still populate, only one network round-trip per data
set — spot-check with React Query devtools or a console log if available),
double-tap a BottomSheet Save button (New Tag sheet is the easiest
reproduction), and check the Home/Insights spending badges for a 0%-change
month.

## Done criteria

- [ ] `grep -n "replace(/\[^0-9.\]/g" "app/edit-subscription/[id].tsx"` → no
      matches (sanitizeDecimalInput used instead)
- [ ] `grep -n "TRANSACTION_TYPE.INVESTMENT" "app/edit-subscription/[id].tsx"` →
      at least one match (the Category-field gate)
- [ ] `grep -rn "lib/db/subscriptions" app/subscriptions/index.tsx "app/edit-subscription/[id].tsx"` →
      no matches
- [ ] `grep -n "useCategoriesByType\|useAllSources" components/transaction-form.tsx components/subscription-form.tsx` →
      both present in both files
- [ ] `grep -n "isSaving" components/ui/bottom-sheet.tsx` → present
- [ ] `lib/spending-change.ts` exists and is imported by
      `hooks/use-home-data.ts`, `hooks/use-insights-data.ts`,
      `app/index.tsx`, and `components/wrap-stats.tsx`
- [ ] `grep -n "PERCENT_DISPLAY_CAP" hooks/use-home-data.ts hooks/use-insights-data.ts` →
      no matches (both now import it instead of declaring it)
- [ ] `grep -n "\.catch" hooks/use-add-transaction.ts` → present near the
      `AI_HINT_DISMISSED` read
- [ ] `pnpm quality` and `pnpm dead-code` clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any quoted excerpt's actual code differs from what's shown above (not
  just line-number drift) — re-read the file and reconcile before editing.
- `subscription.type` is no longer a plain `"expense" | "investment"`
  literal (e.g. a third subscription type was added) — the Step 2 gate and
  its "no other consumers" claim need re-verification.
- `spendingChange` or `getSpendingChangeFlavor` gained a second consumer
  outside `app/index.tsx` since this plan was written — re-run the grep
  from Step 6 and widen the "contained change" analysis before touching the
  type.
- Removing `useQuery`/`QUERY_KEYS` imports in Step 4 breaks the build
  because something else in `subscription-form.tsx` started using them —
  re-check with `pnpm lint` before assuming they're dead.

## Maintenance notes

- Any future amount/units text input must sanitize with
  `sanitizeDecimalInput` from `lib/format.ts`, not a hand-rolled regex —
  this is now the case everywhere in the app after Step 1.
- If the Edit Subscription screen ever grows full SIP-editing support
  (holding, default units, investment kind), it should copy the branching
  pattern from `components/subscription-form.tsx:270-360` rather than
  reinvent it — see the "Out of scope" note above.
- `lib/spending-change.ts` is now the one place month-over-month
  percentage math lives; a third consumer (e.g. a future widget or export
  feature) should import from there, not re-derive the cap/tone logic.
- `BottomSheet`'s Save button now owns its own pending state; consumers
  don't need to (and shouldn't) pass a separate loading prop in.

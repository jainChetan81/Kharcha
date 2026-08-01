# Plan 001: Fix swipe-to-delete gesture bugs (stale closure + wrong-direction commit)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- components/transaction-item.tsx hooks/use-transactions.ts`
> `hooks/use-transactions.ts` is cited as read-only evidence (Step 4 context)
> and is NOT edited by this plan — it's included in the drift check only to
> confirm `useSwipeDelete`'s behavior hasn't changed since planning, not
> because this plan touches it. If `components/transaction-item.tsx` shows
> changes, re-read it in full and re-locate `panResponder`, `avatarLetter`,
> and the `item.id` reset effect by name before proceeding — line numbers
> below may have shifted. If any body differs structurally from the excerpts
> in "Current state" (not just line-shifted), STOP.
>
> **Line numbers shift after Step 1**: Step 1 inserts a ~10-line block before
> `panResponder`'s declaration, so every line number below it (including the
> ones Steps 2 and 3 cite) moves down by that amount once Step 1 lands.
> Locate every edit target in Steps 2 and 3 by searching for its quoted code
> text, not by trusting the stated line number after Step 1 is applied.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f5a9dc9`, 2026-08-01

## Why this matters

Swipe-to-delete on the transaction row is the app's single most-used destructive gesture, and it has two independently-verified mechanical bugs plus one low-severity crash guard gap, all in `components/transaction-item.tsx`:

1. **Critical — deletes the wrong transaction.** The `PanResponder` is created once via `useRef(PanResponder.create(...)).current`. Its `onPanResponderRelease` handler calls `onSwipeDelete?.(item)`, closing over whatever `item` prop was in scope the first time this component instance rendered. `FlashList` recycles row components (confirmed below by reading the actual `@shopify/flash-list` v2 source, not just this file's own comment) — the same React fiber gets reused to display a different transaction as the user scrolls, without unmounting. When that happens, a swipe on the row now showing transaction B still fires delete for transaction A, the transaction the row was first mounted with. The delete happens silently: `useSwipeDelete` (`hooks/use-transactions.ts:524-535`) calls `deleteMutation.mutateAsync(item.id)` immediately and shows a generic "Transaction deleted" success toast — nothing distinguishes "deleted the one you swiped" from "deleted a stale one," so the user has no way to notice.
2. **High — wrong-direction swipe also deletes.** `onPanResponderMove` only moves the row (`translateX.setValue(gesture.dx)`) when `gesture.dx < 0` (leftward drag), so a rightward drag never shows the red reveal or crosses the haptic-tick zone. But `onPanResponderRelease` checks `Math.abs(gesture.dx) > SWIPE_COMMIT_THRESHOLD`, which is sign-agnostic — a hard rightward swipe past 70% of screen width still satisfies the check and fires the exact same delete animation and `onSwipeDelete?.(item)` call, with zero visual or haptic warning during the gesture.
3. **Low — empty-string avatar letter would crash.** `avatarLetter` falls back through `??`, which does not treat `""` as absent. If `merchant`/`category_name`/`holding_name` were ever `""` rather than `null`, `""[0]` is `undefined` and `.toUpperCase()` throws, crashing the memoized row. This is currently masked only by every insert path normalizing `""` to `null` before it reaches the DB (e.g. `hooks/use-add-transaction.ts:286`) — the component itself has no defensive check, and `TransactionRow`'s type (`string | null`) doesn't rule out `""`.

All three were flagged by an earlier full-codebase audit and re-verified directly against the current file and its runtime dependency (`@shopify/flash-list@2.0.2`) while writing this plan — see "Current state" for the exact evidence.

## Current state

- `components/transaction-item.tsx:94-104` — component signature; `item` and `onSwipeDelete` are props, so every re-render receives (potentially) a new `item`:
  ```tsx
  export const TransactionItem = memo(function TransactionItem({
    item,
    showTime = false,
    onPress,
    onSwipeDelete,
  }: {
    item: TransactionRow;
    showTime?: boolean;
    onPress?: (id: number) => void;
    onSwipeDelete?: (item: TransactionRow) => void;
  }) {
  ```
- `components/transaction-item.tsx:110-119` — the file's own comment already documents that FlashList recycles rows in place (this is precedent for the ref-based fix in Step 1 below — it's the same problem, solved for animation state but not for the delete closure):
  ```tsx
  // FlashList recycles row components, so a row that just animated to a
  // collapsed state can come back rendering a different item.id with stale
  // 0-height / off-screen translateX — which shows up as a phantom gap at
  // the top of the list. Reset on every item.id change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.id is the trigger — we intentionally re-run when the slot recycles to a different row even though the body doesn't reference it.
  useEffect(() => {
    translateX.setValue(0);
    itemHeight.setValue(1);
    inCommitZone.current = false;
  }, [item.id, translateX, itemHeight]);
  ```
- `components/transaction-item.tsx:134-179` — the `PanResponder`, created once and never recreated:
  ```tsx
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 10,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {                              // ← line 139, leftward only
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_COMMIT_THRESHOLD) { // ← line 144, sign-agnostic
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.parallel([ /* ... */ ]).start(() => {
            inCommitZone.current = false;
            onSwipeDelete?.(item);                           // ← line 159, closes over mount-time `item`
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 10 }).start();
          inCommitZone.current = false;
        }
      },
      onPanResponderTerminate: () => { /* ... */ },
    }),
  ).current;
  ```
- `components/transaction-item.tsx:209-216` — `titleText` (line 211) already falls back with `||`, correctly treating `""` as absent for the non-investment branch; `avatarLetter` two lines below does not:
  ```tsx
  const titleText = isInvestment
    ? (item.holding_name ?? OTHER_CATEGORY_LABEL)
    : item.merchant || item.category_name || OTHER_CATEGORY_LABEL;
  const avatarLetter = (
    isInvestment
      ? (item.holding_name ?? "?")
      : (item.merchant ?? item.category_name ?? "?")
  )[0].toUpperCase();
  ```
- `components/transaction-item.tsx:227-229` — for contrast, the accessibility delete action is **not** buggy: it's an inline arrow function created fresh every render, so it always closes over the current render's `item`:
  ```tsx
  onAccessibilityAction={(e) => {
    if (e.nativeEvent.actionName === "delete") onSwipeDelete?.(item);
  }}
  ```
  Do not "fix" this one — it's already correct. Only the `useRef`-captured `PanResponder` handlers are stale.
- **Recycling mechanism, verified directly against the installed dependency** (not just this file's comment) — `node_modules/@shopify/flash-list` is at `2.0.2` (`grep '"version"' node_modules/@shopify/flash-list/package.json`). `src/recyclerview/ViewHolderCollection.tsx:162-190` renders each visible cell keyed by an internal pool slot (`reactKey`), not by the app's `keyExtractor` or item identity:
  ```tsx
  Array.from(renderStack.entries(), ([reactKey, { index }]) => {
    const item = data[index];
    return (
      <ViewHolder key={reactKey} index={index} item={item} /* ... */ />
    );
  })
  ```
  Because `reactKey` is a recycling-pool slot that gets reassigned to different `index`/`item` values as the list scrolls, React keeps the **same fiber** and just passes new props — it does not unmount/remount. `src/recyclerview/ViewHolder.tsx:139-158` confirms `ViewHolder` is `React.memo`'d with a comparator that checks `prevProps.item === nextProps.item` (so it re-renders, correctly, when the item changes) — but a re-render is exactly the "same instance, new `item` prop" scenario that breaks the closure in Step 1's target code.
- Callers (context only — not edited by this plan): `hooks/use-transactions.ts:524-535` (`useSwipeDelete`, no confirmation, generic toast on success/failure); `app/history.tsx:266-282` and `app/tag/[id].tsx:168-184` (both wire `FlashList` + `onSwipeDelete={handleSwipeDelete}` the same way).
- Existing precedent for a destructive-action confirm dialog in this codebase (relevant only to the optional Step 4): `hooks/use-transactions.ts:475-493`, `useClearTransactionsWithConfirm`, uses `Alert.alert` with a `style: "destructive"` action.
- Repo conventions: no `any`; functional components only; NativeWind classes only (this file already follows that — do not introduce inline `style` beyond the existing `Animated.View` exceptions, which are pre-existing and out of scope); **never run pnpm commands yourself — tell the operator which command to run and wait for the result.**

## Commands you will need

| Purpose                                    | Command                | Expected on success                              |
|---------------------------------------------|-------------------------|---------------------------------------------------|
| Typecheck                                   | `pnpm typecheck`        | exit 0                                             |
| Lint                                        | `pnpm lint`              | exit 0                                             |
| Combined quality gate                        | `pnpm quality`           | exit 0                                             |
| React/RN anti-pattern scan (pre-push hook for this is currently disabled — run manually) | `pnpm react-doctor:diff` | no new findings against `components/transaction-item.tsx` |

## Scope

**In scope**:
- `components/transaction-item.tsx` — the three required fixes (stale-closure delete, direction-unaware commit, `avatarLetter` guard).

**Out of scope** (do NOT touch):
- `hooks/use-transactions.ts` (`useSwipeDelete`) — unless the operator explicitly asks you to also do the optional Step 4.
- `app/history.tsx`, `app/tag/[id].tsx` — both callers are correct as-is; no change needed for the required fixes.
- `@shopify/flash-list` itself (`node_modules/`) — third-party, cited only as evidence.
- Any redesign of `SWIPE_COMMIT_THRESHOLD`, the two-stage color interpolation, or the haptic-tick zone-crossing effect (`components/transaction-item.tsx:121-132`) — all correct and unrelated to these bugs.

## Git workflow

- Branch: `fix/001-swipe-to-delete-gesture-fix`
- Commit style: `fix(transaction-item): resolve stale-closure delete and direction-unaware swipe commit`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the stale-closure delete (route through a ref that's always current)

The `PanResponder` itself can stay created once — the problem is only that its release handler reads the `item` prop instead of a value that tracks the latest render. Add a ref that's kept in sync via `useEffect` (mirroring the existing `item.id` reset effect immediately above it at lines 110-119, so the pattern is consistent with the rest of the file), and read from it in the release handler instead of the closed-over prop.

Add, right after the existing haptic zone-crossing effect (after line 132, before the `panResponder` declaration at line 134):

```tsx
// The PanResponder below is created once (useRef) so its handlers close
// over whatever `item` was in scope on this fiber's first render. FlashList
// recycles this component across different rows without remounting it (see
// the item.id effect above), so a later swipe could otherwise still delete
// the ORIGINAL item. Keep a ref current so the release handler always reads
// the row actually on screen.
const itemRef = useRef(item);
useEffect(() => {
  itemRef.current = item;
}, [item]);
```

Then change line 159 from:
```tsx
onSwipeDelete?.(item);
```
to:
```tsx
onSwipeDelete?.(itemRef.current);
```

Do not touch the `onAccessibilityAction` handler at lines 227-229 — it already reads live `item` correctly (see "Current state").

**Verify**: `grep -n "itemRef" components/transaction-item.tsx` → shows exactly 3 matches: the `useRef(item)` declaration, the `itemRef.current = item;` effect body, and the `onSwipeDelete?.(itemRef.current);` call site (its line number will have shifted down from 159 by however many lines Step 1's block added — that's expected, not a failure; confirm by content, not by the number 159 literally appearing). `pnpm typecheck` → exit 0.

### Step 2: Make the release-time commit check direction-aware

Find this line (its line number has shifted down since Step 1 — search for the text, don't assume line 144):
```tsx
if (Math.abs(gesture.dx) > SWIPE_COMMIT_THRESHOLD) {
```
Change it to:
```tsx
if (gesture.dx < -SWIPE_COMMIT_THRESHOLD) {
```
This matches `onPanResponderMove`, which only ever moves the row for `gesture.dx < 0`. A rightward swipe now falls through to the existing `else` branch (spring back to 0) instead of committing — and since the row was never visually displaced rightward in the first place, the spring-back is a visual no-op, so no other branch needs to change.

**Verify**: `grep -n "gesture.dx < -SWIPE_COMMIT_THRESHOLD" components/transaction-item.tsx` → one match (confirms the change actually landed, not just that the file still typechecks); `grep -n "Math.abs(gesture.dx) > SWIPE_COMMIT_THRESHOLD" components/transaction-item.tsx` → zero matches (confirms the old sign-agnostic check is gone); `pnpm typecheck` → exit 0.

### Step 3: Guard `avatarLetter` against empty strings

Find this block (its line number has shifted since Step 1 — search for the text, don't assume lines 212-216):
```tsx
const avatarLetter = (
    isInvestment
      ? (item.holding_name ?? "?")
      : (item.merchant ?? item.category_name ?? "?")
  )[0].toUpperCase();
```
to:
```tsx
const avatarLetter = (
    isInvestment
      ? item.holding_name || "?"
      : item.merchant || item.category_name || "?"
  )[0].toUpperCase();
```
This mirrors the `||`-based fallback `titleText` already uses for its non-investment branch (the `item.merchant || item.category_name || OTHER_CATEGORY_LABEL` line) — same technique, now applied consistently so `""` can never reach `[0]`. Note `titleText`'s *investment* branch still uses `??` (`item.holding_name ?? OTHER_CATEGORY_LABEL`) — that's intentionally out of scope for this step too; only `avatarLetter` is being changed.

**Verify**: `grep -n 'item.holding_name || "?"' components/transaction-item.tsx` → one match; `grep -n '(item.holding_name ?? "?"' components/transaction-item.tsx` → zero matches (confirms both `avatarLetter` branches switched from `??` to `||`); `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4 (optional — defense-in-depth, not required to close this plan)

The audit that surfaced these bugs specifically asked whether a lightweight confirmation is worth adding, given this is the app's single most-used destructive gesture and it currently has no undo path. Judgment call for the operator, not a required fix:

- A blocking `Alert.alert` confirm (the pattern already used for `useClearTransactionsWithConfirm`, `hooks/use-transactions.ts:475-493`) would work but cuts against the gesture's own design intent — the file's comments explicitly model this as "iOS Mail-style" swipe-to-delete, and iOS Mail deletes immediately on commit rather than blocking with a dialog. Adding a hard confirm here would be inconsistent with the pattern the component is deliberately copying, and the two-stage red + haptic-tick-at-threshold + medium-impact-on-release already give real warning during the gesture itself.
- The more idiomatic "lightweight" option is an **Undo** affordance on the post-delete toast (what iOS Mail actually does), surfaced via `showSuccessToast` in `lib/toast.ts:26-33` and consumed by `useSwipeDelete` (`hooks/use-transactions.ts:524-535`). This is a real feature addition, not a one-line fix: `lib/toast.ts` wraps `react-native-toast-message` and its `showSuccessToast` signature has no action-button support today, so this would mean extending the toast wrapper's API, plus giving `useSwipeDelete` a way to re-insert the deleted row (the delete mutation would need to be reversible, or `useSwipeDelete` would need to hold the deleted row in memory until the toast expires). Size this as its own follow-up (effort M) if the operator wants it — do not fold it into this plan's required steps.

**Verify** (only if implemented): manual QA — swipe-delete a transaction, confirm an Undo action appears on the toast, tap it, confirm the transaction reappears in the same position; `pnpm typecheck` / `pnpm lint` → exit 0.

## Test plan

No test runner exists for component-level RN gesture behavior in this repo (`pnpm test` is not a defined script — confirmed via `package.json`), so verification here is typecheck/lint plus a manual smoke test the operator runs on-device or in a simulator:

1. Scroll a long transaction history list far enough that FlashList recycles rows (roughly one screen's worth of rows past the fold), then swipe-delete a row near the top. Confirm the toast and the actually-removed row match what was swiped, not a transaction that had scrolled off screen earlier.
2. Swipe a row firmly to the **right**. Confirm the row does not move and nothing is deleted.
3. Swipe a row left past the commit threshold as before. Confirm delete still works exactly as today (this is a regression check — Step 2 must not touch the leftward path).

## Done criteria

- [ ] `itemRef` present and the release-handler delete call reads `itemRef.current`, not `item`
- [ ] `onPanResponderRelease`'s commit check is `gesture.dx < -SWIPE_COMMIT_THRESHOLD` (direction-aware)
- [ ] `avatarLetter` uses `||` fallbacks for both branches (matching the `||` technique `titleText`'s non-investment branch already uses — `titleText`'s own investment branch still correctly uses `??` and is unchanged)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality` all exit 0
- [ ] `pnpm react-doctor:diff` shows no new findings on this file
- [ ] Manual smoke test (Test plan above) passed on-device, reported by the operator
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `components/transaction-item.tsx` no longer has a single `useRef(PanResponder.create(...))` block (e.g. it was refactored into a custom hook or a gesture library like `react-native-gesture-handler` was adopted) — the fix location and shape both change; re-plan rather than force this plan's diff onto a different structure.
- `onSwipeDelete`'s callers (`hooks/use-transactions.ts`, `app/history.tsx`, `app/tag/[id].tsx`) show a confirmation dialog was already added elsewhere since this plan was written — re-verify Step 4's framing before touching anything.
- Any required step's `pnpm typecheck` or `pnpm lint` fails for a reason unrelated to this file (pre-existing repo-wide issue) — report it rather than fixing unrelated errors under this plan's branch.

## Maintenance notes

- The general lesson for this file: anything created via `useRef(...).current` that is supposed to reflect "the row currently on screen" must read through a ref kept in sync every render (or be recreated every render, which defeats the point of `useRef`) — never read a destructured prop directly inside a handler stashed in a `useRef`. If a future swipe action (e.g. swipe-to-archive) is added to this component, route it through `itemRef.current` from the start rather than repeating this bug.
- If `react-native-gesture-handler`'s `Swipeable`/`Reanimated`-based gesture APIs are ever adopted here (a plausible future refactor, since `PanResponder` is the legacy RN gesture API), this whole closure problem goes away because gesture-handler callbacks are re-created per render by design — worth linking back to this plan if that migration is ever scoped.

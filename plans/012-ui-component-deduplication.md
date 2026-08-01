# Plan 012: UI component deduplication and consistency

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- components/ui/inline-add-sheet.tsx hooks/use-inline-adders.tsx components/ui/chip-picker.tsx components/ui/date-picker-modal.tsx components/ui/date-time-picker-row.tsx components/ui/date-time-picker-field.tsx app/config/expense-categories.tsx app/config/income-categories.tsx app/config/sources.tsx app/config/tags.tsx app/portfolio.tsx components/add-category-sheet.tsx components/add-source-sheet.tsx components/add-holding-sheet.tsx components/transaction-form.tsx components/subscription-form.tsx components/investment-fields.tsx components/ui/tag-chip.tsx components/ui/stacked-bar.tsx components/ui/bottom-sheet.tsx components/spending-panel.tsx`
> If any file above changed, re-read it before touching it — the line
> numbers cited below were captured at `f5a9dc9` and will drift. If a cited
> function/component was renamed, moved, or deleted outright, STOP and
> reconcile before proceeding; do not guess at its replacement.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

`components/ui/` (and its immediate neighbors) has accumulated several
pockets of copy-pasted structure: two near-identical chip-picker components,
three near-identical picker-modal components, two near-identical category
config screens, and a family of "create X inline" call sites that hand-roll
the exact mutate→toast→catch sequence a purpose-built component already
encapsulates. None of this is a correctness bug — the app behaves fine today
— but every duplicate is a place a future edit (a new toast string, a new
accessibility label, a new field) has to be made N times and will eventually
only get made once, silently drifting the N call sites apart. Two files also
bypass the `@/components/ui/...` import alias the other 25 files in the
folder use, and one component (`investment-fields.tsx`) widens a TanStack
Form type to `any` in 11 places, contradicting the repo's "no `any`"
convention even though it is locally documented as deliberate.

**Important correction to the source audit**: the audit's most severe
finding in this batch — that `InlineAddSheet` is dead code, "never imported
anywhere" — is **wrong**. The audit's grep (`grep -rn "InlineAddSheet" app
components`) excluded the `hooks/` directory, where `InlineAddSheet` is in
fact imported and used three times by `hooks/use-inline-adders.tsx`, which
is itself consumed by `components/transaction-form.tsx:204` and
`components/subscription-form.tsx:111`. `InlineAddSheet` is live code doing
exactly what its doc comment says for the category/source/holding
"inline-add-from-a-picker" flows. The *real*, re-verified duplication is
narrower and different in shape from what the audit described — see Step 1.

## Current state

### 1. `InlineAddSheet` — live, but under-adopted (not dead)

`components/ui/inline-add-sheet.tsx:12-54` — the component (unchanged from
the audit's excerpt, confirmed correct):

```tsx
export function InlineAddSheet({
  visible, onClose, title, placeholder, submitLabel,
  mutateAsync, onAdded, addedToast, existingToast, errorTitle,
}: { ... }) {
  return (
    <BottomSheet
      visible={visible} onClose={onClose} title={title}
      placeholder={placeholder} submitLabel={submitLabel}
      onSave={async (name) => {
        try {
          const { id, isNew } = await mutateAsync(name);
          onAdded(id);
          onClose();
          showSuccessToast(isNew ? addedToast : existingToast);
        } catch (err) {
          showErrorToast(errorTitle, err);
        }
      }}
    />
  );
}
```

`hooks/use-inline-adders.tsx:21-93` — `useInlineAdders()`, the real (only)
consumer, renders three `InlineAddSheet`s (category, source, holding) and is
itself used at `components/transaction-form.tsx:204-218` and
`components/subscription-form.tsx:111-116`. This is genuinely working code
— confirmed by `grep -rn "InlineAddSheet\|useInlineAdders" app components
hooks lib`, which shows 3 `InlineAddSheet` JSX call sites inside the hook
and 2 `useInlineAdders(...)` call sites in the two form components.

The doc comment on `InlineAddSheet` (lines 4-11) names **category, source,
holding, and tag** as intended consumers. Only the first three are actually
wired through `useInlineAdders`. The exact boilerplate the component exists
to remove is hand-duplicated in **six** places instead of the audit's five
— the sixth is the "tag" consumer the doc comment already promised and never
got:

- `app/config/expense-categories.tsx:81-97` (inside the `AddCategorySheet`
  `onSave` callback, lines 77-99):
  ```tsx
  onSave={async (name) => {
    try {
      const { isNew } = await addMutation.mutateAsync({
        name, type: TRANSACTION_TYPE.EXPENSE,
      });
      setShowAdd(false);
      showSuccessToast(isNew ? "Category added" : TOAST_COPY.ALREADY_EXISTS);
    } catch (err) {
      if (err instanceof Error) showErrorToast("Failed", err.message);
      else showErrorToast("Failed", "Could not add category");
    }
  }}
  ```
- `app/config/income-categories.tsx:81-97` — byte-identical structure,
  `TRANSACTION_TYPE.INCOME` instead.
- `app/config/sources.tsx:71-86` — same shape, `addMutation.mutateAsync(name)`
  (no `type` field), `"Source added"`.
- `app/config/tags.tsx:326-334` (inside a raw `<BottomSheet onSave=...>` at
  line 320, no wrapper component):
  ```tsx
  onSave={async (name) => {
    try {
      const { isNew } = await addMutation.mutateAsync(name);
      setAddSheetVisible(false);
      showSuccessToast(isNew ? "Tag added" : "Tag already exists");
    } catch (err) {
      showErrorToast("Failed to add tag", err);
    }
  }}
  ```
- `app/portfolio.tsx:113-126` (inside `AddHoldingSheet`'s `onSave`, which
  also receives an `instrumentType` the other five sites don't have):
  ```tsx
  onSave={async (name, instrumentType) => {
    try {
      const { isNew } = await addMutation.mutateAsync({
        name, instrument_type: instrumentType,
      });
      setShowAdd(false);
      showSuccessToast(isNew ? "Holding added" : "Already exists — kept existing");
    } catch (err) {
      showErrorToast("Failed to add holding", err);
    }
  }}
  ```
- `components/transaction-form.tsx:837-856` — a raw `<BottomSheet>` for
  "New Tag", in the **same file** that already uses `InlineAddSheet` twice
  via `adders` two hundred lines above it:
  ```tsx
  <BottomSheet
    visible={newTagSheetVisible}
    onClose={() => setNewTagSheetVisible(false)}
    title="New Tag"
    placeholder="e.g. goa-trip, birthday, wfh"
    submitLabel="Add Tag"
    onSave={async (name) => {
      try {
        const { id } = await addTagMutation.mutateAsync(name);
        const current = form.getFieldValue("tagIds") ?? [];
        if (!current.includes(id)) form.setFieldValue("tagIds", [...current, id]);
        setNewTagSheetVisible(false);
        showSuccessToast("Tag added");
      } catch (err) {
        showErrorToast("Failed to add tag", err);
      }
    }}
  />
  ```
  Note this one has an actual (latent, cosmetic) bug the other five don't:
  `addTag()` (`lib/db/tags.ts:26-38`) returns `{ id, isNew }` exactly like
  the other mutations, but this call site destructures only `{ id }` and
  always shows `"Tag added"` — so typing an existing tag's name (case-
  insensitively deduped server-side) still says "added" instead of
  distinguishing "selected existing" like every other inline-add site does.

Two of the six sites (`expense-categories.tsx`, `income-categories.tsx`, plus
`sources.tsx`) route through a thin wrapper component that is *already*
`BottomSheet`-shaped identically to `InlineAddSheet` and does nothing but
forward `onSave` — `components/add-category-sheet.tsx` (28 lines) and
`components/add-source-sheet.tsx` (26 lines) — confirmed by reading both in
full; neither adds any field beyond `name`.

`app/portfolio.tsx`'s `AddHoldingSheet` (`components/add-holding-sheet.tsx`,
129 lines) is different in kind: it renders its own `<BottomSheet>` content
directly (not via `InlineAddSheet`'s single-`Input` shape) because it needs
an extra instrument-type chip selector (lines 76-106, a `Pressable` grid over
`INSTRUMENT_OPTIONS`). `InlineAddSheet`'s API (`mutateAsync: (name) =>
Promise<{id, isNew}>`) has no slot for a second field — this one does not
fit without widening `InlineAddSheet`'s contract.

Also relevant: toast copy for "already exists" is **not** currently uniform
across even the audit's five sites — `TOAST_COPY.ALREADY_EXISTS`
(`lib/constants.ts:172`, `"Already exists — kept existing"`) is used by
categories/sources/portfolio; tags.tsx hand-writes `"Tag already exists"`;
and `INLINE_ADD_COPY` (`lib/constants.ts:185-211`, already used by the two
real `InlineAddSheet` consumers) uses yet a third phrasing per item type
(`"Selected existing category"`, `"Selected existing source"`, `"Selected
existing holding"`). `INLINE_ADD_COPY` currently has no `TAG` entry.

### 2. `ChipPicker` / `MultiChipPicker` — real ~90-line duplication, confirmed

`components/ui/chip-picker.tsx`, 191 lines total. `ChipPicker` (single-select)
spans lines 13-107 (94 lines); its chip-row rendering is lines 61-90.
`MultiChipPicker` (multi-select) spans lines 109-191 (82 lines); its chip-row
rendering is lines 145-174. Both blocks are the same `ScrollView` →
`Pressable` → `accessibilityState={{ selected }}` → `cn(...)` chip structure,
differing only in the selection predicate (`selectedId === item.id` vs.
`selectedIds.includes(item.id)`) and what `onPress` does.

One asymmetry the audit didn't flag: `MultiChipPicker` is *less* generic
than `ChipPicker` today. `ChipPicker`'s "add new" chip takes a caller-
supplied `addLabel` prop (`+ {addLabel ?? "New"}`, line 100). `MultiChipPicker`
hardcodes `"+ New tag"` and `accessibilityLabel="Add new tag"` (lines 179,
184), and every selected chip's label is hardcoded to `#{item.name}` (line
170) rather than `{item.name}` (line 86 in `ChipPicker`). This is because
`MultiChipPicker`'s only two current callers
(`components/transaction-form.tsx:824`, `components/history-filters-sheet.tsx:232`)
are both tag pickers — the component was written generically in name only.
Any shared base must not silently bake the `#`-prefix/"tag" copy back in as
if it were generic.

### 3. Date/time picker modals — real triplicated chrome, confirmed

`components/ui/date-picker-modal.tsx`, 283 lines total, three exports:
`DatePickerModal` (19-111), `TimePickerModal` (113-180),
`DateTimePickerModal` (182-283). All three repeat, near-verbatim:
- the `<Modal transparent animationType="slide">` + backdrop `<Pressable
  className="flex-1 bg-black/50" onPress={onCancel} ...>`
- the `rounded-t-2xl bg-card` header row with Cancel / optional Clear /
  Done(-or-Next)
- the same `<ComponentErrorBoundary onDismiss={onCancel}><Suspense
  fallback={<PickerLoader />}>` wrapping a single `<DateTimePicker
  display="spinner" themeVariant="dark" textColor={COLORS.WHITE} .../>`

What is *not* shared chrome and must not be collapsed: each modal owns its
own `tempDate` state seeded only-on-open via a `biome-ignore
useExhaustiveDependencies` `useEffect` (documented rationale: parents often
pass a freshly-`parse()`d `Date` on every render, so syncing on every
`value` change would clobber in-progress spinner selection).
`DateTimePickerModal` additionally owns a `step` state (`"date" | "time"`,
line 200) and a `handleNext` (213-219) that advances the step instead of
confirming — `Cancel` still exits the whole flow unconditionally from either
step (no "back" button). The audit's characterization of
`DateTimePickerModal` as "effectively `DatePickerModal`+`TimePickerModal`
glued together with a `step` state instead of reusing either" is accurate.

Two consumers use these modals in genuinely different UX shapes and must
stay that way: `components/ui/date-time-picker-row.tsx` opens
`DatePickerModal` and `TimePickerModal` as two **separate** sequential
modals (two buttons, lines 41-66); `components/ui/date-time-picker-field.tsx`
opens `DateTimePickerModal`, the single **combined** two-step modal, from
one button. Do not merge these two call patterns while extracting shared
chrome.

### 4. `expense-categories.tsx` / `income-categories.tsx` — confirmed ~95%+ identical

`diff app/config/expense-categories.tsx app/config/income-categories.tsx`
(both files, 107 lines each) shows exactly **8** changed line-groups out of
107 lines: the component name, one `TRANSACTION_TYPE` filter value, the
`ScreenHeader` title string, two description sentences, the add-button
label, and two more `TRANSACTION_TYPE` references in the `onSave` callback.
Everything else — imports, hook wiring, `ConfigRow` mapping, the
`AddCategorySheet` + `Suspense` + `ComponentErrorBoundary` block, the
try/catch shape — is byte-for-byte identical.

### 5. Two `components/ui` files use relative imports (confirmed, exactly 2 of 27)

```
$ grep -rln '^import.*from "\./' components/ui/*.tsx
components/ui/date-time-picker-row.tsx
components/ui/date-picker-modal.tsx
$ ls components/ui/*.tsx | wc -l
27
```
`date-picker-modal.tsx:5`: `import { Text } from "./text";`.
`date-time-picker-row.tsx:6-7`: `import { Icon } from "./icon"; import {
Text } from "./text";`. The other 25 files use `@/components/ui/text` etc.

### 6. `investment-fields.tsx` — `any`-widened TanStack Form type (confirmed, 11 of 12 generics, not "all 12")

`components/investment-fields.tsx:23-47`. `ReactFormExtendedApi` takes 12
generic parameters (confirmed against the installed
`@tanstack/react-form@1.29.0` type, `node_modules/@tanstack/react-form/dist/esm/useForm.d.ts:23`:
`<TFormData, TOnMount, TOnChange, TOnChangeAsync, TOnBlur, TOnBlurAsync,
TOnSubmit, TOnSubmitAsync, TOnDynamic, TOnDynamicAsync, TOnServer,
TSubmitMeta>` — none of the 11 trailing params has a default). The local
code correctly types the first (`TransactionFormValues`) and widens the
**other 11** to `any`, each with its own `biome-ignore
lint/suspicious/noExplicitAny`. The audit's "all 12" is off by one — the
first param is real. `transaction-form.tsx`'s `useForm({ defaultValues,
onSubmit })` call passes no `onMount`/`onChange`/`onBlur`/`onSubmitAsync`/
`onServer`/`onDynamic` validators, so most of those 11 positions would
legitimately type as `undefined` (each generic's bound is `undefined |
FormValidateOrFn<TFormData>`) rather than `any` — see Step 5.

### 7. Inline `style` usage outside the documented exception (confirmed, but two different situations)

Convention text, `CLAUDE.md:58`: *"nativewind classes only, no inline
`style` prop... only exception: third-party native components (e.g.
DateTimePicker) that don't support className"*. Same clause duplicated at
`.claude/rules/project-conventions.md:12`.

Three of the four flagged files use `style` for values NativeWind's static
class extraction genuinely cannot express — a runtime hex string, a numeric
prop-driven height, a `useSafeAreaInsets()` number — and are already
self-documented as deliberate:
- `components/ui/tag-chip.tsx:35-38` (`backgroundColor`/`borderColor` from a
  per-tag hex `tint`) and `:51` (`color: tint`) — doc comment at lines 18-23
  already says *"this is one of the rare places we need inline `style`"*.
- `components/ui/stacked-bar.tsx:23,31` (`style={{ height }}`, `height` is a
  numeric prop, default `8`).
- `components/ui/bottom-sheet.tsx:93` (`style={{ paddingBottom:
  Math.max(bottom, 24) }}`, `bottom` from `useSafeAreaInsets()`).

These three are not really "violations" to fix in code — there's no
NativeWind class for an arbitrary runtime hex or a `useSafeAreaInsets()`
number computed at render time. The actual gap is documentation: the
written exception clause only mentions third-party components. See Step 5.

The fourth — `components/spending-panel.tsx:161-165` — is different: it's a
pure two-state (`pressed`/not) boolean with **no dynamic value**, exactly
what NativeWind's `active:` variant is for, and the codebase already has a
live precedent one file away:
```tsx
// components/ui/button.tsx:17
"bg-primary active:bg-primary/90 shadow-sm shadow-black/5",
```
vs. the target:
```tsx
// components/spending-panel.tsx:156-165
<Pressable
  key={row.key}
  accessibilityRole="button"
  onPress={() => router.push(row.href)}
  className="-mx-3 flex-row items-center rounded-xl px-3 py-2.5"
  style={({ pressed }) => ({
    backgroundColor: pressed ? "rgba(150, 150, 150, 0.1)" : "transparent",
  })}
>
```
Caveat for whoever implements this: `button.tsx`'s `active:` classes target
semantic tokens (`bg-primary/90`, `bg-accent`) — there is no existing
`active:bg-<neutral-gray>/10`-style class already in use elsewhere in the
codebase for a plain row-press tint, so this is not a literal copy-paste of
an existing class; see Step 5 for the recommended approximation and the
required visual check.

### 8. `date-time-picker-field.tsx` — unguarded `format(parse(...))` (confirmed, still latent)

`components/ui/date-time-picker-field.tsx:51-56`:
```tsx
{value
  ? format(parse(value, DATE_TIME_FORMAT, new Date()), DATE_DISPLAY_FORMAT)
  : placeholder}
```
`date-fns`'s `format()` throws `RangeError: Invalid time value` on an
Invalid Date; `parse()` returns Invalid Date for any string that doesn't
match `DATE_TIME_FORMAT`. Confirmed the only current renderer of this
component is `components/tag-schedule-sheet.tsx` (two call sites, lines
112 and 133), whose `value` comes from `field.state.value` seeded from
`defaults?.startAt`/`endAt` — ultimately DB-backed `Tag.start_date`/
`end_date` columns, which are only ever written via `format(now,
DATE_TIME_FORMAT)` (`app/config/tags.tsx:391`,
`components/quick-start-tag-sheet.tsx:49-50`). So today the string is
always well-formed — this is latent, not reachable — but nothing at the
component boundary enforces it, and it's a one-line, zero-risk guard.

## Commands you will need

| Purpose        | Command             | Expected on success |
|----------------|----------------------|----------------------|
| Typecheck      | `pnpm typecheck`     | exit 0 |
| Lint            | `pnpm lint`          | exit 0 |
| Full gate       | `pnpm quality`       | exit 0 |
| Dead code       | `pnpm dead-code`     | no new unused-export findings; `AddCategorySheet`/`AddSourceSheet` may newly appear here after Step 1 — that's expected, see Step 1 |
| React anti-patterns (changed files) | `pnpm react-doctor:diff` | no new findings |
| Run on iOS      | `pnpm ios`           | app launches for manual smoke test |
| Run on Android  | `pnpm android`       | app launches for manual smoke test |

There is no automated test runner configured in this repo (`pnpm test` does
not exist) — verification is typecheck/lint/dead-code plus the manual
smoke tests named in each step.

## Scope

**In scope**:
- `components/ui/inline-add-sheet.tsx`, `hooks/use-inline-adders.tsx`, and
  (only if Step 1's Option A is taken) the `onSave` bodies of
  `app/config/expense-categories.tsx`, `app/config/income-categories.tsx`,
  `app/config/sources.tsx`, `app/config/tags.tsx`,
  `components/transaction-form.tsx`'s "New Tag" sheet, plus
  `components/add-category-sheet.tsx` / `components/add-source-sheet.tsx`
  (deletion) and `lib/constants.ts` (`INLINE_ADD_COPY` — add a `TAG` entry
  if needed)
- `components/ui/chip-picker.tsx` (internal refactor only)
- `components/ui/date-picker-modal.tsx` (internal refactor only)
- `app/config/expense-categories.tsx`, `app/config/income-categories.tsx`
  (consolidate into a shared component/config; both route files must still
  exist and still `export default` per expo-router's file-based routing)
- `components/ui/date-picker-modal.tsx:5`, `components/ui/date-time-picker-row.tsx:6-7`
  (import style only)
- `components/investment-fields.tsx` (type-only change)
- `components/spending-panel.tsx` (style → className only)
- `CLAUDE.md`, `.claude/rules/project-conventions.md` (broaden the inline-
  `style` exception clause — doc only)
- `components/ui/date-time-picker-field.tsx` (one added guard)

**Out of scope** (do NOT touch):
- `app/portfolio.tsx`'s `AddHoldingSheet` flow / `components/add-holding-sheet.tsx`
  — its instrument-type selector doesn't fit `InlineAddSheet`'s shape;
  forcing it in is a larger redesign than this plan's budget. Leave it on
  its own bespoke sheet.
- Any parsing/db/mutation logic (`lib/db/**`) — this plan touches
  presentation only.
- `components/ui/tag-chip.tsx`, `components/ui/stacked-bar.tsx`,
  `components/ui/bottom-sheet.tsx` — inline `style` here is a genuine
  technical necessity (dynamic hex / numeric prop / safe-area inset with no
  static NativeWind equivalent); do not attempt to convert these to
  className. Fix the documentation instead (Step 5).
- Rewriting `DateTimePickerModal` to literally compose `DatePickerModal` +
  `TimePickerModal` internally (a deeper behavioral refactor of the wizard
  flow) — Step 3 extracts shared **chrome** only, not shared **state
  machine**.
- Any TanStack Form / TanStack Query version bump.

**This plan is a pure refactor with no intended product change.** The
duplication clusters (chip pickers, date/time modals, category screens) are
widely-reused, load-bearing components — `ChipPicker`/`MultiChipPicker`
render on nearly every add/edit/filter sheet in the app, and the picker
modals render on every date/time field. The main risk here is **visual or
behavioral regression that is easy to introduce and easy to miss** in a
refactor like this (a dropped `hitSlop`, a changed `accessibilityState`, a
shifted `key`, a chip that no longer has `active:` haptic feedback, a modal
that no longer respects `minimumDate`). For each of Steps 2-4: after the
refactor, every call site's rendered output and behavior must be
indistinguishable from before — same classes, same props threaded through,
same haptics, same accessibility roles/labels/states, same modal timing.
Do not "improve" anything visually while consolidating; that's a separate,
future change with its own review.

## Git workflow

- Branch: `fix/012-ui-component-deduplication`
- Commit per step; style: `refactor(ui): adopt InlineAddSheet for hand-rolled add flows`,
  `refactor(ui): extract shared chip-list base for ChipPicker/MultiChipPicker`,
  `refactor(ui): extract shared modal chrome for date/time pickers`,
  `refactor(config): consolidate expense/income category screens`,
  `chore(ui): small consistency fixes (imports, any-widening, inline style)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `InlineAddSheet` — adopt for the hand-rolled sites that fit, document the one that doesn't

This is a real decision point. Two options — **Option A is recommended**:

**Option A (recommended)**: Migrate the five sites where the shape actually
fits — `expense-categories.tsx`, `income-categories.tsx`, `sources.tsx`,
`tags.tsx`, and `transaction-form.tsx`'s "New Tag" sheet — to render
`<InlineAddSheet>` directly, passing each screen's **current, exact** copy
strings as props (`addedToast`, `existingToast`, `errorTitle`) rather than
switching to `INLINE_ADD_COPY`'s different phrasing — that would be a silent
user-facing copy change and is out of scope here. Concretely:
1. In `expense-categories.tsx` / `income-categories.tsx`, replace the
   `<AddCategorySheet>` + inline `onSave` try/catch (lines 75-101 each)
   with `<InlineAddSheet title=... placeholder="Category name"
   submitLabel="Add Category" mutateAsync={(name) =>
   addMutation.mutateAsync({ name, type: TRANSACTION_TYPE.EXPENSE })}
   onAdded={...} addedToast="Category added"
   existingToast={TOAST_COPY.ALREADY_EXISTS} errorTitle="Failed" />`. Note
   `InlineAddSheet`'s `errorTitle` maps to `showErrorToast(errorTitle, err)`
   — the current code branches on `err instanceof Error` to choose between
   `err.message` and a fallback string as the toast *body*; `InlineAddSheet`
   already passes `err` straight through to `showErrorToast`, so confirm
   `showErrorToast`'s signature (`lib/toast.ts`) handles a non-`Error` `err`
   the same way before assuming this is a no-op change — if it doesn't,
   that's a real behavior difference to report, not silently absorb.
2. Same pattern for `sources.tsx` (lines 66-88), with `mutateAsync={(name)
   => addMutation.mutateAsync(name)}`.
3. In `tags.tsx`, replace the raw `<BottomSheet>` add-tag block (lines
   320-335) with `<InlineAddSheet ... existingToast="Tag already exists"
   ... />` (its current, unique copy — don't unify it with the others'
   phrasing in this plan).
4. In `transaction-form.tsx`, replace the raw `<BottomSheet>` "New Tag"
   block (lines 837-856) with `<InlineAddSheet>`, wiring `onAdded` to the
   existing `form.setFieldValue("tagIds", [...current, id])` logic. This
   incidentally **fixes** the latent bug noted in Current State §1 (the
   missing `isNew` branch) as a side effect of reuse — call this out
   explicitly in your report as an intentional, in-scope behavior fix, not
   an accidental one.
5. Add a `TAG` entry to `INLINE_ADD_COPY` (`lib/constants.ts:185-211`) only
   if you want tags.tsx/transaction-form.tsx to eventually share copy — not
   required for this step; each `InlineAddSheet` call can pass literal
   strings instead. Prefer literal strings if it avoids inventing a new
   shared-copy decision that isn't otherwise called for.
6. Delete `components/add-category-sheet.tsx` and
   `components/add-source-sheet.tsx` once their only call sites are
   migrated — confirm with `grep -rn "AddCategorySheet\|AddSourceSheet"
   app components hooks` that no reference remains before deleting.
7. Leave `app/portfolio.tsx` / `components/add-holding-sheet.tsx` untouched
   — documented reason above (extra instrument-type field, no slot in
   `InlineAddSheet`'s API).

**Option B (fallback, only if a specific site from Option A turns out not
to fit cleanly during implementation)**: leave that site's `BottomSheet`/
wrapper structure as-is, and instead extract just the shared
`mutateAsync → isNew ? added : existing → catch → error` logic into a small
helper (e.g. a `runDedupedAdd(mutateAsync, copy, onAdded)` function in
`hooks/use-inline-adders.tsx` or a new tiny module) that both
`InlineAddSheet` and the holdout site's hand-rolled `onSave` call — so the
logic is de-duplicated even where the UI shape isn't. Do not apply Option B
wholesale to all five sites without first attempting Option A; the whole
point of this step is that `InlineAddSheet` already works for three
structurally-identical siblings (category/source/holding via
`useInlineAdders`), so the burden of proof is on a site *not* fitting, not
the other way around.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `pnpm dead-code`
→ `AddCategorySheet`/`AddSourceSheet` no longer appear as files (deleted) and
no new unused-export warnings elsewhere; `grep -rn "InlineAddSheet"
app components hooks` → 5 real JSX call sites plus the 3 pre-existing ones in
`use-inline-adders.tsx` (8 total, up from 3). Manual smoke test on
`pnpm ios`/`pnpm android`: on each of the 4 migrated config screens, add a
brand-new category/source/tag → toast text matches what it said before your
change; add a name that already exists (case-insensitive) → "already
exists"-style toast still fires with its *original* wording, sheet still
closes, item still gets selected/associated as before. In the transaction
form, tap "+ New tag", type an existing tag's name → toast should now
correctly say "existing" rather than "added" (this is the one intentional
behavior change in this step).

### Step 2: Extract a shared base for `ChipPicker` / `MultiChipPicker`

Factor the shared `ScrollView` + chip-row rendering out of
`components/ui/chip-picker.tsx` into one internal generic component (e.g.
`ChipList<T>`) parameterized by: `items`, a `isSelected(item) => boolean`
predicate, an `onToggle(item) => void` callback, a `getLabel(item) => string`
formatter (defaulting to `item.name` — `MultiChipPicker`'s current tag
callers pass `(item) => \`#${item.name}\`\``), and the existing `onAddNew`/
`addLabel` props (both components get the parametrized `addLabel` — do not
leave `MultiChipPicker`'s hardcoded `"+ New tag"`/`"Add new tag"` baked into
the shared base; its two current callers should pass `addLabel="tag"`
explicitly so the rendered output is unchanged). Keep `ChipPicker` and
`MultiChipPicker` as the two exported, differently-typed public functions
(callers' import lines must not change) — they become thin callers of the
shared base with their own selection semantics. Preserve exactly: the
`CHIP_SCROLL_STYLE`/`CHIP_HIT_SLOP` constants, `hapticSelect()` on every
press, `accessibilityRole="button"`, `accessibilityState={{ selected }}`,
the `bg-primary`/`bg-muted`/`border-border bg-card` class combinations per
state, and `MultiChipPicker`'s empty-state early return (`items.length ===
0 && !onAddNew`) which `ChipPicker` doesn't have.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
test: open a screen using `ChipPicker` (e.g. the holding picker in
Add Transaction) and one using `MultiChipPicker` (tag picker in Add
Transaction, or the tag filter in History) — selection, haptics, and the
"+ New" chip must look and behave identically to before.

### Step 3: Extract shared modal chrome for the date/time pickers

In `components/ui/date-picker-modal.tsx`, factor the repeated `<Modal>` +
backdrop `<Pressable>` + header row (Cancel / optional Clear / Done-or-Next)
+ `<ComponentErrorBoundary><Suspense fallback={<PickerLoader />}>` wrapper
into one internal shell component (e.g. `PickerModalShell`) taking `visible`,
`title`, `onCancel`, `onClear?`, `doneLabel`, `onDone`, and `children` (the
actual `<DateTimePicker .../>`). Each of `DatePickerModal`, `TimePickerModal`,
`DateTimePickerModal` keeps its own `tempDate`/`step` state and its own
`useEffect` (the `biome-ignore useExhaustiveDependencies` comments and their
rationale must be preserved verbatim or re-justified, not silently dropped)
— only the JSX chrome moves into the shell. Do not attempt to also
unify the two different consumption patterns (`date-time-picker-row.tsx`'s
two-separate-modals vs. `date-time-picker-field.tsx`'s one-combined-modal)
— that's a caller-side UX decision, out of scope here.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual smoke
test: open a date-only field (e.g. a transaction's date), a time-only
context if one exists, and a combined date+time field (tag schedule start/
end in `app/config/tags.tsx` → Schedule) — confirm Cancel/Clear/Done all
still work, the spinner still opens with the current value pre-selected
(not reset to now), and `DateTimePickerModal`'s Date→Time step transition
still shows "Next" then "Done" with Cancel exiting fully from either step.

### Step 4: Consolidate `expense-categories.tsx` / `income-categories.tsx`

Extract the shared screen body into one component (e.g.
`components/category-list-screen.tsx`, or co-located in
`app/config/_category-list-screen.tsx` if you want it excluded from
expo-router's route table — verify expo-router doesn't treat an
underscore-prefixed file under `app/config/` as a route; if unsure, put the
shared component under `components/` instead, which is unambiguous) taking
a `type: "expense" | "income"` prop and rendering everything that's
currently identical between the two files: the `ScreenHeader`, the
`ConfigRow` list, the `DashedAddButton`, the `AddCategorySheet`/
`InlineAddSheet` (post-Step-1) wiring. Move the 8 differing strings
(header title, description copy, button label) into a small copy map keyed
by `type` (e.g. alongside `TOAST_COPY`/`INLINE_ADD_COPY` in
`lib/constants.ts`, following that existing pattern rather than inventing a
new one). `app/config/expense-categories.tsx` and
`app/config/income-categories.tsx` must both still exist as separate route
files (expo-router requires a file per route) but should shrink to a
one-line `type` + copy selection wrapping the shared component.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `diff
app/config/expense-categories.tsx app/config/income-categories.tsx` → the
only differences left should be the `type`/copy-key values, nothing
structural. Manual smoke test: both screens still show their own title,
description, and add-button label; adding/reordering/deleting a category
still works on both, and an expense category never leaks into the income
list or vice versa.

### Step 5: Small consistency fixes

Bundle these — each is small and independently low-risk:

1. **Relative imports**: in `components/ui/date-picker-modal.tsx:5`, change
   `import { Text } from "./text";` to `import { Text } from
   "@/components/ui/text";`. In `components/ui/date-time-picker-row.tsx:6-7`,
   change `import { Icon } from "./icon";` and `import { Text } from
   "./text";` to their `@/components/ui/...` equivalents. Purely mechanical,
   zero behavior change.

2. **`spending-panel.tsx` inline style → `active:` variant**: replace the
   `style={({ pressed }) => ({ backgroundColor: pressed ? "rgba(150, 150,
   150, 0.1)" : "transparent" })}` at lines 161-165 with a NativeWind
   `active:` class on the existing `className` (line 160), e.g. `className="-mx-3
   flex-row items-center rounded-xl px-3 py-2.5 active:bg-foreground/10"`.
   There is no pre-existing identical class elsewhere in the codebase to
   copy verbatim (`button.tsx`'s `active:` classes target semantic tokens,
   not a plain neutral-gray row tint) — `active:bg-foreground/10` is a
   reasonable approximation of `rgba(150,150,150,0.1)` but is **not
   guaranteed pixel-identical** in both light and dark theme. Flag this to
   the operator for a visual check in both themes rather than assuming it's
   correct; adjust the opacity/token if it visibly differs from the
   original.

3. **`investment-fields.tsx` `any`-widening**: attempt to narrow the 11
   `any` generic positions in `TxFormApi` (lines 26-46) to `undefined`
   where the actual `useForm()` call in `transaction-form.tsx` passes no
   validator for that slot (confirmed: only `onSubmit` is wired; `onMount`,
   `onChange`, `onChangeAsync`, `onBlur`, `onBlurAsync`, `onSubmitAsync`,
   `onDynamic`, `onDynamicAsync`, `onServer` are all unset, and each
   generic's bound is `undefined | FormValidateOrFn<TFormData>` per
   `node_modules/@tanstack/react-form/dist/esm/useForm.d.ts:23`, so
   `undefined` is a valid substitute for `any` there). For `onSubmit`
   specifically, try the real validator-function type if `pnpm typecheck`
   accepts it; if getting an exact match is fiddly (this is genuinely a
   TanStack Form ergonomics problem, not a Kharcha-specific one), leave
   that one position as `any` with its existing `biome-ignore` comment.
   Partial improvement (some of the 11 narrowed, one or two left as
   documented `any`) is an acceptable outcome — report exactly which
   positions were narrowed and which weren't, and why. Do not spend
   excessive time chasing a fully clean signature; this finding is P3/low-
   risk by design.

4. **Inline `style` documentation gap**: broaden the exception clause in
   `CLAUDE.md:58` and `.claude/rules/project-conventions.md:12` from
   *"only exception: third-party native components (e.g. DateTimePicker)
   that don't support className"* to also cover computed/dynamic values
   NativeWind's static class compiler cannot express — e.g. *"...also:
   runtime-computed values with no static NativeWind equivalent (dynamic
   hex colors, numeric heights/insets from props or
   `useSafeAreaInsets()`) — keep these narrowly scoped and comment why."*
   Do **not** touch `tag-chip.tsx`, `stacked-bar.tsx`, or `bottom-sheet.tsx`
   — their inline `style` usage is the thing the broadened clause is
   meant to describe, not a bug to fix.

5. **`date-time-picker-field.tsx` unparseable-date guard**: in the display-
   value ternary at lines 51-56, guard the `format(parse(...))` call so an
   unparseable `value` falls back to `placeholder` instead of throwing.
   `date-fns`'s `parse()` returns an `Invalid Date` (not a thrown error) for
   a non-matching string, so check with `Number.isNaN(parsed.getTime())`
   before calling `format()`:
   ```tsx
   {(() => {
     if (!value) return placeholder;
     const parsed = parse(value, DATE_TIME_FORMAT, new Date());
     return Number.isNaN(parsed.getTime())
       ? placeholder
       : format(parsed, DATE_DISPLAY_FORMAT);
   })()}
   ```
   (or equivalent named-helper form if you prefer not to IIFE inline — match
   whatever style the file already leans toward). Also apply the same guard
   to the `value` passed into `<DateTimePickerModal value={...}>` at line
   61, which has the identical unguarded `parse()` call.

**Verify** (for all of Step 5): `pnpm typecheck` → exit 0; `pnpm lint` →
exit 0; `pnpm quality` → exit 0. For item 2, operator visually confirms the
row-press tint in both light and dark theme via `pnpm ios`/`pnpm android`.
For item 5, no automated test exists — confirm by temporarily feeding
`DateTimePickerField` a garbage `value` string in a dev build and observing
it renders `placeholder` instead of crashing, then revert the temporary
change (do not leave test scaffolding in the diff).

## Test plan

No automated test suite exists in this repo. Verification is
`pnpm typecheck` / `pnpm lint` / `pnpm dead-code` / `pnpm quality` after
every step, plus the manual smoke tests named per step, run via `pnpm ios`
and/or `pnpm android` (operator confirms; tell them which command to run and
wait). Given this plan touches five widely-reused UI surfaces, the manual
pass should specifically include: Add Transaction (category/source/holding/
tag pickers, both InlineAddSheet flows and the date/time field), Add
Subscription (category/source/holding pickers), History filters (tag
multi-select), and all of Categories / Sources / Tags / Holdings config
screens (add + dedupe-toast behavior).

## Done criteria

- [ ] `grep -rn "InlineAddSheet" app components hooks` shows 8 JSX call
      sites (5 newly migrated + 3 pre-existing in `use-inline-adders.tsx`),
      or a documented Option-B fallback for any site that didn't fit
- [ ] `components/add-category-sheet.tsx` / `components/add-source-sheet.tsx`
      deleted (if Step 1 Option A completed) with no remaining references
- [ ] `ChipPicker`/`MultiChipPicker` share one internal base; both exported
      function signatures unchanged
- [ ] `DatePickerModal`/`TimePickerModal`/`DateTimePickerModal` share one
      chrome wrapper; all three exported function signatures unchanged
- [ ] `diff app/config/expense-categories.tsx app/config/income-categories.tsx`
      shows only type/copy-key differences
- [ ] `grep -rln '^import.*from "\./' components/ui/*.tsx` → empty
- [ ] `investment-fields.tsx`'s `TxFormApi` has fewer than 11 `any`
      positions, OR a documented reason each remaining one couldn't be
      narrowed
- [ ] `components/spending-panel.tsx` has no `style=` prop
- [ ] `CLAUDE.md` and `.claude/rules/project-conventions.md` inline-style
      exception clauses updated and consistent with each other
- [ ] `date-time-picker-field.tsx` guards `format(parse(...))` in both
      places it's called
- [ ] `pnpm quality` and `pnpm dead-code` clean after every step
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited file's structure no longer matches the excerpts above (see
  drift check).
- `showErrorToast`'s handling of a non-`Error` `err` differs meaningfully
  between the hand-rolled `err instanceof Error ? ... : ...` branch in the
  category/source screens and `InlineAddSheet`'s direct `showErrorToast(errorTitle,
  err)` — resolve which behavior is correct before migrating, don't silently
  pick one.
- Migrating `tags.tsx` or `transaction-form.tsx`'s tag-add to
  `InlineAddSheet` changes anything about the `tagIds` field-value wiring
  beyond the intentional `isNew` fix called out in Step 1 — that field
  drives auto-tag-selection and a subtle bug there is easy to miss visually.
- The `expo-router` route-table check in Step 4 reveals an underscore-
  prefixed file under `app/config/` *is* treated as a route (i.e. the
  shared component can't safely live there) — put it under `components/`
  instead and note the correction.
- Any Step 2/3 refactor changes a rendered class list, `accessibilityState`,
  or `hitSlop` value for an existing caller — that's the exact regression
  this plan is trying to avoid; revert and re-derive rather than pushing
  through.

## Maintenance notes

- `InlineAddSheet`'s doc comment already promised "tag" as a consumer;
  after Step 1 that promise is finally true. If a fifth "inline add" item
  type appears in the future (e.g. a picker for something new), it should
  default to `InlineAddSheet` unless it needs more than a single text
  field, in which case follow `AddHoldingSheet`'s precedent (bespoke sheet,
  own `onSave` wiring) rather than stretching `InlineAddSheet`'s API.
- If `AddHoldingSheet`'s instrument-type-selector need ever recurs
  elsewhere, that's the actual trigger to widen `InlineAddSheet` to support
  an optional second field — not before, since it would be speculative today.
- The three toast-copy variants for "dedupe, selected existing" (`TOAST_COPY.ALREADY_EXISTS`,
  each `INLINE_ADD_COPY.*.existingToast`, and tags.tsx's one-off string)
  were deliberately left as-is in this plan to avoid an uninstructed copy
  change. If the team wants copy unified, that's a separate, product-facing
  decision, not a tech-debt refactor.

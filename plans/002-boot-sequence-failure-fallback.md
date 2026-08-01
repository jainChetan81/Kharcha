# Plan 002: Boot sequence failure fallback (splash-screen hang)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- app/_layout.tsx lib/db/subscriptions.ts lib/toast.ts lib/firebase/index.ts`
> If `app/_layout.tsx` changed, re-read the boot `useEffect` (currently
> lines 174-198) and the splash-hide `useEffect` (currently lines 196-198)
> before proceeding — the line numbers below may have shifted. If the
> function shapes of `processSubscriptions`, `showErrorToast`, or
> `logFirebaseError` changed (not just moved), STOP.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

The boot `useEffect` in `app/_layout.tsx` (lines 174-194) only calls
`setDbReady(true)` if `initDB()`, `processSubscriptions()`, and a
`prefetchQuery` all resolve without throwing. `dbReady` gates `ready`
(line 172), and `ready` gates `SplashScreen.hideAsync()` (line 197). So any
thrown error anywhere in that chain — not just in `initDB()` — leaves the
native splash screen on screen **forever**. The app never becomes
interactive; there is no way out short of force-quitting, and since nothing
about the failure is transient-vs-permanent, reopening the app just replays
the same hang.

This isn't a hypothetical throw surface. `processSubscriptions`
(`lib/db/subscriptions.ts:213`) runs inside `expo.withTransactionAsync` and,
per active subscription, does a real `db.insert(transactions)` (line 299)
and — for investment subscriptions — calls `safeRecomputeHolding`
(line 325), which does its own arithmetic over holding rows. Any of those
can throw (constraint violation, disk I/O error, a bug in the recompute
math) on a device where `initDB()` itself succeeded. The JSON parse in
`parseBillingDays` (lines 58-79) already guards itself with a try/catch and
falls back to the legacy `billing_day` — that one path is *not* a hang risk
— but nothing downstream of it is guarded.

The `.catch()` on the chain (line 191-193) does call `showErrorToast`, but
that fires into the `<Toast>` tree rendered inside `RootLayout` — the same
tree that stays unmounted-behind-splash until `ready` is true. Native
`SplashScreen` is a full-screen overlay above the JS tree, so the toast
renders with literally nobody able to see it. The user experiences a plain
hang: no error, no retry, no explanation.

## Current state

- `app/_layout.tsx:47` — splash is prevented from auto-hiding at module load:
  ```ts
  SplashScreen.preventAutoHideAsync();
  ```
- `app/_layout.tsx:170-198` — the boot chain and the splash-hide effect:
  ```tsx
  const [dbReady, setDbReady] = useState(false);
  const { locked, authenticate } = useAppLock(dbReady);
  const ready = dbReady && fontsLoaded;

  useEffect(() => {
    initDB()
      .then(async () => {
        const created = await processSubscriptions();
        if (created.length > 0) {
          showSuccessToast(
            `${created.length} subscription${created.length > 1 ? "s" : ""} renewed`,
            created.join(", "),
          );
        }
        await queryClient.prefetchQuery({
          queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
          queryFn: readAutoRefreshPrefs,
        });
        setDbReady(true);
        syncWidgetData();
      })
      .catch((err) => {
        showErrorToast("Database Error", err);
      });
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  ```
- `lib/db/subscriptions.ts:213-330` — `processSubscriptions`: real write surface
  (`db.insert(transactions)` at line 299, `safeRecomputeHolding` at line 325),
  wrapped in `expo.withTransactionAsync`. The `logFirebaseError` /
  `logEvent` imports (lines 14-19) are already in use elsewhere in this file
  for the "SIP with no holding" case (lines 286-294) — the same pattern this
  plan needs for the boot chain's non-fatal steps.
- `lib/db/index.ts:89-96` — `initDB` wraps its body in `withTrace("db_init", ...)`.
  `withTrace` (`lib/firebase/index.ts:119-151`) rethrows on failure (lines
  143-150: `catch (error) { await stopTrace(); throw error; }`), so a real
  `initDB` failure does propagate to the `.catch()` in `_layout.tsx` — this
  part of the chain is not silently swallowed, it's just terminal.
- `lib/toast.ts:16-24` — `showErrorToast(title, err)`: shows a
  `react-native-toast-message` toast and calls
  `AccessibilityInfo.announceForAccessibility`. No fallback path if the toast
  can't be seen (e.g. hidden behind splash).
- `components/locked-screen.tsx` (28 lines) — the existing house style for a
  full-screen, pre-`Stack` gate: centered icon in a circular `bg-card`
  badge, title, subtitle, single `Pressable` CTA. This plan's new component
  should match it.
- `components/error-boundary.tsx:10-44` — `ScreenError`, the existing
  "something went wrong, Try Again" pattern (icon + message + retry button),
  used inside error boundaries. Confirms the repo's established shape for
  this exact kind of fallback; this plan does not reuse `ScreenError`
  directly because it also renders a "Go Home" button that calls
  `router.replace` — not meaningful before the app has finished booting.
- Repo conventions: no `any`; NativeWind classes only; functional
  components only; **never run pnpm commands yourself — tell the operator
  which command to run and wait.**

## Commands you will need

| Purpose    | Command           | Expected on success |
|------------|-------------------|----------------------|
| Typecheck  | `pnpm typecheck`  | exit 0               |
| Lint       | `pnpm lint`       | exit 0               |
| Full gate  | `pnpm quality`    | exit 0               |
| Run on iOS | `pnpm ios`        | app launches for manual smoke test |
| Run on Android | `pnpm android` | app launches for manual smoke test |

There is no automated test runner configured in this repo (`pnpm test` does
not exist) — verification for this plan is typecheck/lint plus the manual
smoke tests described in Step 5.

## Scope

**In scope**:
- `app/_layout.tsx` — the boot `useEffect`, the splash-hide `useEffect`, and
  the render branch that currently does `{ready ? (...) : null}`
- New file: `components/boot-error-screen.tsx`

**Out of scope** (do NOT touch):
- `lib/db/subscriptions.ts`, `lib/db/index.ts`, `lib/firebase/index.ts` —
  read-only for this plan; the fix is entirely in how `_layout.tsx` reacts to
  failures, not in making the underlying calls fail less.
- `hooks/use-app-lock.ts` — already degrades gracefully on its own config
  read failure (catches and leaves unlocked); not part of this finding.
- `useFonts` / font-load failure handling — a different, separate failure
  mode from the one in this finding; note it in your report if you spot
  something concerning but do not fix it here.
- Any change to what `processSubscriptions` or the prefetch actually do —
  this plan changes only how their *failures* are handled.

## Git workflow

- Branch: `fix/002-boot-sequence-failure-fallback`
- Commit style: `fix(app): add bounded boot failure fallback so splash never hangs forever`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split the boot chain into one fatal step and two best-effort steps

In `app/_layout.tsx`, `initDB()` failing means the app genuinely cannot run
(no database) — that stays fatal. `processSubscriptions()` and the
`prefetchQuery` are maintenance/warm-cache steps: `processSubscriptions` is
idempotent (dedup logic at lines 244-261 of `subscriptions.ts` means a
missed run is caught on the next launch) and the prefetch is just a cache
warm for `useAutoRefreshPrefs` — any screen that actually needs it will
refetch on demand. Neither should be able to keep the user out of the app.

Replace the boot `useEffect` (lines 174-194) with:

```tsx
const [dbReady, setDbReady] = useState(false);
const [bootError, setBootError] = useState<Error | null>(null);
const [bootAttempt, setBootAttempt] = useState(0);

useEffect(() => {
  let cancelled = false;
  setBootError(null);

  (async () => {
    // Fatal: without a working database there is nothing for the app to do.
    await initDB();
    if (cancelled) return;

    // Best-effort: failures here are logged and surfaced, but must not
    // block the app from becoming usable.
    try {
      const created = await processSubscriptions();
      if (created.length > 0) {
        showSuccessToast(
          `${created.length} subscription${created.length > 1 ? "s" : ""} renewed`,
          created.join(", "),
        );
      }
    } catch (err) {
      logFirebaseError(err, {
        error_type: ERROR_TYPE.DB,
        boot_step: "processSubscriptions",
      });
      showErrorToast("Some subscriptions may not have renewed", err);
    }

    try {
      await queryClient.prefetchQuery({
        queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
        queryFn: readAutoRefreshPrefs,
      });
    } catch (err) {
      // Non-fatal: useAutoRefreshPrefs() refetches on demand if the
      // prefetch didn't warm the cache.
      logFirebaseError(err, {
        error_type: ERROR_TYPE.DB,
        boot_step: "prefetchSyncPrefs",
      });
    }

    if (cancelled) return;
    setDbReady(true);
    syncWidgetData();
  })().catch((err) => {
    if (cancelled) return;
    const error = err instanceof Error ? err : new Error(String(err));
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      boot_step: "initDB",
    });
    setBootError(error);
  });

  return () => {
    cancelled = true;
  };
}, [bootAttempt]);
```

Add `logFirebaseError` and `ERROR_TYPE` to the existing `@/lib/firebase`
import (line 42 currently imports only `logScreenView` from there).

**Verify**: `pnpm typecheck` → exit 0. Read the new effect back and confirm
`initDB()` is the only call outside a `try/catch` before `setDbReady(true)`.

### Step 2: Create `components/boot-error-screen.tsx`

Match the existing `LockedScreen` shape (`components/locked-screen.tsx`) —
same icon-in-circle-badge layout, same spacing scale — so the pre-`Stack`
gates in `_layout.tsx` look like a family:

```tsx
import { AlertTriangle } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type BootErrorScreenProps = {
  error: Error;
  onRetry: () => void;
};

export function BootErrorScreen({ error, onRetry }: BootErrorScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <View className="mb-8 size-24 items-center justify-center rounded-full bg-card">
        <Icon as={AlertTriangle} className="size-10 text-negative-text" />
      </View>

      <Text className="mb-2 text-2xl font-bold text-foreground">
        Kharcha couldn't start
      </Text>
      <Text className="mb-10 text-center text-sm text-muted-foreground">
        {error.message || "Something went wrong while loading your data."}
      </Text>

      <Pressable
        onPress={onRetry}
        className="w-full items-center rounded-2xl bg-primary py-3"
      >
        <Text className="text-base font-semibold text-primary-foreground">
          Try Again
        </Text>
      </Pressable>
    </View>
  );
}
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (NativeWind
classes only, no inline `style` — this component has neither issue by
construction, confirm on read-back).

### Step 3: Hide the splash screen on either outcome, not just success

Replace the splash-hide effect (current lines 196-198):

```tsx
useEffect(() => {
  if (ready) SplashScreen.hideAsync();
}, [ready]);
```

with a version that also hides on a terminal failure — "terminal" meaning
boot has *concluded*, whether that conclusion is success or a fatal error:

```tsx
useEffect(() => {
  if ((dbReady || bootError) && fontsLoaded) SplashScreen.hideAsync();
}, [dbReady, bootError, fontsLoaded]);
```

`ready` (line 172, `dbReady && fontsLoaded`) stays as-is — it still means
"fully booted, render the app." This new condition is the strictly broader
"boot is done one way or another" gate that controls only the splash overlay.

**Verify**: `pnpm typecheck` → exit 0. Confirm by inspection that `ready`
itself is unchanged (`dbReady && fontsLoaded`) — only the splash-hide
condition grew a `|| bootError` branch.

### Step 4: Render the error screen instead of an infinite blank/splash state

In the JSX render (inside the `<Suspense>` block, current lines 265-283),
add a `bootError` branch ahead of the existing `ready ? ... : null`:

```tsx
{bootError ? (
  <BootErrorScreen
    error={bootError}
    onRetry={() => {
      setBootError(null);
      setBootAttempt((n) => n + 1);
    }}
  />
) : ready ? (
  locked ? (
    <LockedScreen onUnlock={authenticate} />
  ) : (
    <>
      <ScreenViewTracker />
      <ForegroundMiniSync />
      <ShareIntentListener />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          animationDuration: 250,
        }}
      />
      <MonthlyWrapGate />
    </>
  )
) : null}
```

Add the import: `import { BootErrorScreen } from "@/components/boot-error-screen";`
next to the existing `LockedScreen` import (line 23).

Bumping `bootAttempt` re-runs the Step 1 effect (it's in the dependency
array), which re-invokes `initDB()` and either succeeds (clearing
`bootError` and eventually setting `dbReady`) or fails again through the
same guarded path — no separate retry code path to maintain.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `pnpm quality`
→ exit 0.

### Step 5: Manual smoke test (tell the operator to run this — do not attempt it yourself)

Tell the operator to run `pnpm ios` (or `pnpm android`) and confirm three
scenarios:

1. **Normal boot**: app launches as before — splash hides, home screen
   appears. (Regression check — nothing about the happy path should have
   changed.)
2. **Fatal failure**: temporarily force `initDB()` to throw (e.g. add
   `throw new Error("test boot failure")` as the first line of the
   try-block in `lib/db/index.ts`'s `initDB`, reload the app, then remove
   it) and confirm the splash hides and `BootErrorScreen` renders with a
   working "Try Again" button — pressing it should re-attempt boot (and
   succeed once the injected throw is removed and the app is reloaded).
3. **Non-fatal failure**: temporarily make `processSubscriptions` throw
   (e.g. add a `throw` at the top of the function body, reload, then
   remove it) and confirm the app still boots normally to the home screen,
   with an error toast now visible (not hidden behind splash, since the app
   is already rendered by the time this toast fires).

Do not leave any injected `throw` in the codebase — these are for manual
verification only and must be reverted before committing.

**Verify**: operator confirms all three scenarios behave as described.

## Test plan

No automated test harness exists in this repo for boot-sequence behavior
(no `pnpm test` script). Coverage is: typecheck/lint per step (mechanical
correctness) plus the three-scenario manual smoke test in Step 5 (behavioral
correctness). If a test runner is ever added to this repo, the ideal future
coverage is a unit test around the boot effect's control flow (fatal vs.
best-effort classification) with `initDB`/`processSubscriptions`/prefetch
mocked — out of scope here since no harness exists yet.

## Done criteria

- [ ] `initDB()` failure sets `bootError`, hides the splash screen, and
      renders `BootErrorScreen` with a working retry
- [ ] `processSubscriptions()` failure and prefetch failure are each caught
      individually, logged via `logFirebaseError`, and do NOT prevent
      `setDbReady(true)`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality` all exit 0
- [ ] Operator has manually confirmed all three Step 5 scenarios
- [ ] No injected `throw` statements left in `lib/db/index.ts` or
      `lib/db/subscriptions.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `processSubscriptions` or the prefetch's `queryFn` turn out to have a
  side effect that genuinely must complete before the app is usable (e.g. a
  hidden dependency another screen assumes is already satisfied at first
  render) — that would mean the "best-effort" classification in Step 1 is
  wrong, and the fix needs a different shape. Report what you found instead
  of guessing.
- `initDB()`'s error type is something callers are expected to introspect
  (e.g. a specific error class/code used elsewhere to distinguish "fresh
  install" from "corrupt db") — check `lib/db/index.ts` for any such
  handling before treating all `initDB` failures identically.

## Maintenance notes

- The `bootAttempt` retry counter pattern (bump a number in a dependency
  array to force an effect to re-run) is now the house pattern for "retry
  this async boot step" — reuse it if another boot-time step needs the same
  treatment later rather than inventing a second retry mechanism.
- If a step is ever added to the boot chain that genuinely must succeed
  before the app is usable, add it before `setDbReady(true)` *outside* any
  try/catch (fatal), matching `initDB()`'s treatment — not inside the
  best-effort block.
- This plan intentionally does not add a timeout around `initDB()` for a
  promise that never settles (neither resolves nor rejects) — everything
  read during investigation (`db.run`, drizzle migrations) resolves or
  rejects, it doesn't hang indefinitely. If that assumption ever turns out
  false in the field (crash reports showing boot stuck with no error
  logged), that's a follow-up plan: wrap `initDB()` in a
  `Promise.race` against a timeout that synthesizes a `bootError`.

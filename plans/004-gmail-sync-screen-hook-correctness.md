# Plan 004: Gmail-sync screen and hook correctness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Step 5 opens with a decision point — read it before writing any
> code for that step; do not pick a path yourself if the operator hasn't
> weighed in (see Step 5). If anything in the "STOP conditions" section
> occurs, stop and report — do not improvise. When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you
> and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- hooks/use-gmail-sync-ui.ts app/gmail-sync.tsx hooks/use-auto-refresh-prefs.ts hooks/use-refresh.ts`
> If any of these changed since planning, re-read the affected file in full
> and reconcile against the excerpts below before proceeding; on a
> fundamental mismatch (function renamed/restructured), STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

Six findings (one pair is a duplicate — the same dead-code observation from two subsystem surveys) cluster around the Gmail Sync screen and its two hooks. All six were re-verified by reading the live files in full; none were stale. Two are worth calling out up front:

1. **`handleVerify` force-disconnects Gmail on any error.** A `try/catch` around two `fetch()` calls treats a timed-out request, a 5xx from Gmail, a rate-limit, or literally any thrown error as "session expired" — it revokes sign-in, deletes the sync cursor, and shows "Gmail disconnected" immediately before "Session expired". A user on a flaky connection who taps "Verify" gets logged out of Gmail sync entirely, for no auth-related reason. Neither `fetch()` call has a timeout, so a hung request also leaves `verifying` (and the derived `busy` flag that disables every sync control) stuck `true` until the app restarts.

2. **The "Enable Gmail Sync" toggle is worse than inert.** The audit flagged it as "does nothing." Re-verifying turned up something more concrete: `hooks/use-auto-refresh-prefs.ts` reads `CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED`, which is **never written anywhere except by the toggle itself** (confirmed by grep — no seed value in `initDB()`, no default on Gmail connect). That means `autoRefreshEnabled` is `false` for every user, on every install, until they find and flip this specific switch — and `app/gmail-sync.tsx:145` gates the **manual** "Sync Now" button on it: `disabled={busy || noActiveBanks || !autoRefreshEnabled}`. So today, out of the box, the manual sync button is disabled for everyone, and the thing that actually runs "automatic" Gmail sync — pull-to-refresh in `hooks/use-refresh.ts`'s `useSyncRefresh` — doesn't consult this flag at all; it syncs Gmail unconditionally whenever `gmailConnected` is true. The switch's own copy ("Turn off to pause all Gmail syncing — manual and automatic") describes a feature that doesn't exist while accidentally gating a feature it never mentions. Step 5 fixes both halves and needs an explicit decision on shape (see that step).

The remaining four are smaller, independently-verified correctness/convention issues in the same two files: a config key that means two different things depending on who wrote it last, one line of unreachable dead code (flagged twice by the audit), and an inline `style` prop on two plain `View`/`Text` components that the repo's own convention forbids outside third-party native components.

## Current state

### 1. `handleVerify` — any error ⇒ forced disconnect, no timeout

`hooks/use-gmail-sync-ui.ts:124-155`:

```ts
async function handleVerify() {
    setVerifying(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        await handleSessionExpired();
        return;
      }
      const res = await fetch(`${GMAIL_API.MESSAGES}?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await handleSessionExpired();
        return;
      }

      const profileRes = await fetch(GMAIL_API.PROFILE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setEmail(profile.emailAddress);
      }

      logEvent(FIREBASE_EVENTS.GMAIL_VERIFIED);
      showSuccessToast("Connection verified");
    } catch {
      await handleSessionExpired();
    } finally {
      setVerifying(false);
    }
  }
```

Neither `fetch()` has a `signal`/timeout. `handleSessionExpired()` (lines 102-106) calls `handleDisconnect()` (`signOut()` + `gmailSyncConfig.disconnect()` + `showSuccessToast("Gmail disconnected")`) and then shows `showErrorToast("Session expired", ...)`. The established timeout pattern already exists twice elsewhere in the codebase — `lib/mini-sync.ts:93-94` and `lib/gemini/client.ts:219-220` both do `const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), X_TIMEOUT_MS);` with `finally { clearTimeout(timeoutId) }`.

### 2. `handleUpdateSyncFrom` mislabels "Last Synced"; `handleSync` never refreshes the picker

`hooks/use-gmail-sync-ui.ts:157-161`:

```ts
async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    await gmailSyncConfig.updateSyncFromDate(date);
    setLastSynced(date.toISOString());
  }
```

`gmailSyncConfig.updateSyncFromDate` (`hooks/use-gmail-sync.ts:8-10`) writes `date` into `CONFIG_KEYS.GMAIL_LAST_SYNCED_AT` — that write is *correct*: `lib/gmail/sync.ts:198` reads that same key as `syncFromCursor`, the starting point for the next sync's Gmail query. The bug is the next line: `setLastSynced(date.toISOString())` makes the "Last Synced" info row (`app/gmail-sync.tsx:161-168`) display the user's manually-picked date as if a sync had just completed, when none did.

The mirror-image bug is in `handleSync`, `hooks/use-gmail-sync-ui.ts:163-185`:

```ts
async function handleSync() {
    try {
      const response = await gmailSyncMutation.mutateAsync();
      if (response.result.nobanks) {
        showErrorToast("No active banks", "Add a bank in settings to sync");
        return;
      }

      setLastSynced(
        (await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT)) ?? null,
      );

      setSyncResult(response.result);
      setShowResults(true);
      showSuccessToast("Sync completed");
    } catch (err) {
      if (err instanceof Error && err.message === "No active banks") {
        showErrorToast("No active banks", "Add a bank in settings to sync");
      } else {
        showErrorToast("Sync failed", err);
      }
    }
  }
```

`lib/gmail/sync.ts:456-459` writes `new Date().toISOString()` into `GMAIL_LAST_SYNCED_AT` after every successful sync (both the "found nothing" early return at line 258-263 and the normal completion at the end). `handleSync` reads that back into `lastSynced` (correct), but never calls `setSyncFromDate(...)` — so the "Fetch emails after" `DateTimePickerRow` (`app/gmail-sync.tsx:128-135`) keeps showing whatever it showed before the sync, even though the real cursor just moved to "now".

### 3. Dead code — `response.result.nobanks` can never be true (duplicate finding, audit indices 24 & 45)

Same `handleSync` excerpt above, lines 165-169. `hooks/use-gmail-sync.ts:29-38`:

```ts
mutationFn: async () => {
      logEvent(FIREBASE_EVENTS.GMAIL_SYNC_STARTED);
      const result = await syncGmailTransactions();

      if (result.nobanks) {
        throw new Error("No active banks");
      }

      return { result };
    },
```

`mutateAsync()` throws before it can ever resolve with `result.nobanks === true`, so `handleSync`'s `if (response.result.nobanks)` branch is unreachable. The actual no-banks case is already handled correctly a few lines below, in the `catch` block's `err.message === "No active banks"` check.

### 4. Inline `style` prop on `StatLine` / `Badge`

`app/gmail-sync.tsx:304-347`:

```tsx
function StatLine({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: string;
  color: string;
}) {
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl bg-background px-4 py-3">
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <View
        className="rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${color}22` }}
      >
        <Text className="text-[11px] font-semibold" style={{ color }}>
          {count}
        </Text>
      </View>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}22` }}
    >
      <Text
        className="text-[10px] font-bold uppercase tracking-wide"
        style={{ color }}
      >
        {text}
      </Text>
    </View>
  );
}
```

Both are plain `View`/`Text` — not third-party native components — so this violates `CLAUDE.md`'s "nativewind classes only, no inline `style` prop ... only exception: third-party native components". Callers pass raw hex from `lib/constants.ts`'s `COLORS` object (`COLORS.POSITIVE`/`WARNING`/`DANGER`/`BADGE_BLUE`/`PRIMARY`/`MUTED` — all six are used, across `StatLine` at lines 258-275 and `EmailLogRow`'s `statusColor`/`parsedColor`/`confidenceColor` maps at lines 350-367). Five of those six already have a matching semantic Tailwind token in `tailwind.config.js` (`positive`, `warning`, `negative`/`negative-text`, `primary`/`primary-text`, `muted-foreground` — confirmed by reading the config); only `COLORS.BADGE_BLUE` (`#1d4ed8`) has no token. The codebase already uses NativeWind's opacity-modifier syntax elsewhere for the same "tinted pill" look (e.g. `app/reimbursements.tsx:144` `bg-positive/10`, `app/add.tsx:74` `bg-primary/15`, `components/tag-status-badge.tsx:12` `bg-primary/20`), so a static tone→class lookup is a drop-in replacement, not a new pattern.

### 5. "Enable Gmail Sync" toggle: persisted and displayed, never wired to real auto-sync

`hooks/use-auto-refresh-prefs.ts:6-22`:

```ts
export type AutoRefreshPrefs = {
  gmail: boolean;
};

export async function readAutoRefreshPrefs(): Promise<AutoRefreshPrefs> {
  const gmail = await getConfig(CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED);
  return {
    gmail: gmail === BOOL_FLAG.ON,
  };
}

export function useAutoRefreshPrefs() {
  return useQuery({
    queryKey: [QUERY_KEYS.USER_SYNC_PREFS],
    queryFn: readAutoRefreshPrefs,
  });
}
```

`grep -rn "GMAIL_SYNC_USER_ENABLED"` across the repo returns exactly three hits, all inside `use-auto-refresh-prefs.ts` itself (`readAutoRefreshPrefs`, `useSetAutoRefreshPref`) plus the one call site in `app/_layout.tsx:184-187` — which is a `queryClient.prefetchQuery` at startup that nothing else acts on. Nothing ever seeds this key to `"1"`, so `gmail === BOOL_FLAG.ON` is `false` for every user until they manually flip the switch in `app/gmail-sync.tsx`.

Compare with the mini-sync feature's equivalent flag, `hooks/use-mini-sync.ts:23-29`:

```ts
  const configured = Boolean(env.MINI_API_URL) && Boolean(env.MINI_API_TOKEN);
  const enabledFlag = raw?.[CONFIG_KEYS.MINI_SYNC_ENABLED];
  // Default to enabled when the mini env vars are configured and the user
  // hasn't explicitly toggled it off. This avoids needing a settings screen
  // in v1 while still letting a future toggle disable the feature.
  const enabled =
    enabledFlag === "1" || (enabledFlag === undefined && configured);
```

...and mini sync's actual trigger, `app/_layout.tsx:113-141` (`ForegroundMiniSync`), which reads its own enabled flag on every `AppState` "active" transition and on mount, then calls `runMiniSync()`. There is no equivalent for Gmail anywhere in the repo. The place Gmail sync *does* run automatically today is pull-to-refresh, `hooks/use-refresh.ts:32-99` (`useSyncRefresh`, consumed by `app/index.tsx:269` and `app/history.tsx:53`):

```ts
export function useSyncRefresh() {
  const queryClient = useQueryClient();
  const { isConnected } = useGoogleAuth();
  const { enabled: miniSyncEnabled } = useMiniSyncConfig();
  const miniSync = useMiniSync();
  const [refreshing, setRefreshing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, [isConnected]);

  const inFlight = useRef(false);
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const tasks: Promise<void>[] = [];

      if (gmailConnected) {
        tasks.push(
          (async () => {
            try {
              const result = await syncGmailTransactions();
              if (result.nobanks) {
                showErrorToast(
                  "No active banks",
                  "Add a bank in settings to sync",
                );
              } else if (result.added > 0) {
                showSuccessToast("Gmail synced", formatMiniSyncResult(result));
              }
            } catch (err) {
              showErrorToast("Gmail sync failed", err);
            }
          })(),
        );
      }
      // ... miniSyncEnabled gates the mini-sync task the same way, a few lines down
```

`gmailConnected` is the *only* gate — `GMAIL_SYNC_USER_ENABLED` never enters this function. So today: the switch is `false` by default and disables the manual "Sync Now" button (`app/gmail-sync.tsx:145`) for everyone who hasn't found it, while the pull-to-refresh path it claims to control runs unconditionally regardless of its value. Both halves are broken, in opposite directions. See Step 5.

Repo conventions applying throughout: no `any`; NativeWind classes only; TanStack Query for all data fetching; **never run pnpm commands yourself — tell the operator which command to run and wait for the result.**

## Commands you will need

| Purpose   | Command           | Expected on success                    |
|-----------|--------------------|-----------------------------------------|
| Typecheck | `pnpm typecheck`   | exit 0                                  |
| Lint      | `pnpm lint`        | exit 0                                  |
| Dead code | `pnpm dead-code`   | no new findings (prop/type renames in step 4 can strand old names) |

No test runner exists in this repo (`package.json` has no `test` script, no `vitest`/`*.test.ts` files) — verification is typecheck/lint plus the manual smoke checks called out per step and in "Test plan" below.

## Scope

**In scope**:
- `hooks/use-gmail-sync-ui.ts`
- `app/gmail-sync.tsx`
- `hooks/use-auto-refresh-prefs.ts`
- `hooks/use-refresh.ts` — **not in the original three-file assignment.** Step 5 requires it: it's the file that actually runs "automatic" Gmail sync today (pull-to-refresh), and the toggle can't be made honest without touching where the automatic behavior lives. Called out explicitly rather than silently expanding scope.

**Out of scope** (do NOT touch):
- `lib/gmail/auth.ts` — `getValidAccessToken()` also swallows network errors during token refresh and returns `null` indistinguishably from a real auth failure (its `catch { return null; }` at lines 127-129). This is the same root-cause pattern as finding 1, one layer down, but it's a shared helper also used by `hooks/use-sync-state.ts` — fixing it is a separate, larger-blast-radius change. Flagged in Maintenance notes, not fixed here.
- `hooks/use-sync-state.ts` — `loadState()` (lines 18-47) has the identical "no token ⇒ force sign-out" shape on app launch. Same family of bug, different call site, not in this plan's assigned findings.
- `lib/gmail/sync.ts` — the sync engine itself is untouched; this plan only changes how its result/config are consumed and displayed.
- `tailwind.config.js` — no new color token is added; the one `COLORS` value without an existing token (`BADGE_BLUE`) is inlined as a literal NativeWind arbitrary-value class instead (see Step 4).
- Building an `AppState`-driven Gmail auto-sync component (Option A in Step 5) — only in scope if the operator explicitly chooses it over this plan's default.

## Git workflow

- Branch: `fix/004-gmail-sync-screen-hook-correctness`
- Commit per step, style:
  - `fix(gmail-sync): don't force-disconnect Gmail on transient verify errors; add timeout`
  - `fix(gmail-sync): stop mislabeling last-synced date; keep sync-from picker fresh`
  - `fix(gmail-sync): remove unreachable nobanks branch in handleSync`
  - `fix(gmail-sync): replace inline style colors with NativeWind tone classes`
  - `fix(gmail-sync): make the sync toggle actually gate auto-sync on refresh`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `handleVerify` — only a real auth failure disconnects; add a timeout

In `hooks/use-gmail-sync-ui.ts`, add a module-level timeout constant near the top of the file (same pattern as `lib/mini-sync.ts:17` / `lib/gemini/client.ts:19`):

```ts
const GMAIL_VERIFY_TIMEOUT_MS = 15_000;
```

Rewrite `handleVerify` (lines 124-155):

```ts
async function handleVerify() {
    setVerifying(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GMAIL_VERIFY_TIMEOUT_MS,
    );
    try {
      const token = await getValidAccessToken();
      if (!token) {
        await handleSessionExpired();
        return;
      }
      const res = await fetch(`${GMAIL_API.MESSAGES}?maxResults=1`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      // Only 401/403 actually means the token is invalid. Anything else
      // (5xx, 429, or any other non-ok status) is not proof the session
      // expired — don't force a disconnect over it.
      if (res.status === 401 || res.status === 403) {
        await handleSessionExpired();
        return;
      }
      if (!res.ok) {
        showErrorToast(
          "Verification failed",
          `Gmail returned ${res.status}. Try again.`,
        );
        return;
      }

      const profileRes = await fetch(GMAIL_API.PROFILE, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setEmail(profile.emailAddress);
      }

      logEvent(FIREBASE_EVENTS.GMAIL_VERIFIED);
      showSuccessToast("Connection verified");
    } catch (err) {
      // Network failure, timeout/abort, or a JSON parse error land here.
      // None of these prove the Gmail session expired — surface them as an
      // ordinary failure instead of disconnecting the user.
      if (err instanceof Error && err.name === "AbortError") {
        showErrorToast(
          "Verification timed out",
          "Check your connection and try again",
        );
      } else {
        showErrorToast("Verification failed", err);
      }
    } finally {
      clearTimeout(timeoutId);
      setVerifying(false);
    }
  }
```

The `if (!token)` branch is untouched — `getValidAccessToken()` returning `null` (out of scope `lib/gmail/auth.ts`, see Scope) is left as the existing, intentional "no usable token ⇒ treat as expired" behavior.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual (operator): put the device in airplane mode, tap "Verify" — expect a "Verification failed" (or "timed out") toast, Gmail stays connected, `busy` clears within ~15s. Tap "Verify" again on a genuinely revoked/expired session (e.g. revoke access in Google account settings) — expect "Session expired" and a real disconnect.

### Step 2: Stop `handleUpdateSyncFrom` from faking a "Last Synced" time

`hooks/use-gmail-sync-ui.ts:157-161` — remove the `setLastSynced` call; the config write (which is the real, correct next-sync cursor) stays:

```ts
async function handleUpdateSyncFrom(date: Date) {
    setSyncFromDate(date);
    // CONFIG_KEYS.GMAIL_LAST_SYNCED_AT doubles as "next sync's cursor" (read
    // by lib/gmail/sync.ts) and "last synced" display value. Writing the
    // user's picked date here correctly moves the cursor, but must NOT touch
    // `lastSynced` — picking a date doesn't mean a sync happened.
    await gmailSyncConfig.updateSyncFromDate(date);
  }
```

**Verify**: `pnpm typecheck` → exit 0. Manual (operator): on the Gmail Sync screen, change "Fetch emails after" to a past date — confirm "Last Synced" does NOT change.

### Step 3: Keep the sync-from picker fresh after a real sync; delete the unreachable `nobanks` branch

`hooks/use-gmail-sync-ui.ts:163-185` — replace the dead `if (response.result.nobanks)` block with a refresh of both `lastSynced` and `syncFromDate` from the cursor `lib/gmail/sync.ts` just wrote:

```ts
async function handleSync() {
    try {
      const response = await gmailSyncMutation.mutateAsync();

      // Every successful sync writes CONFIG_KEYS.GMAIL_LAST_SYNCED_AT to
      // "now" (lib/gmail/sync.ts) — that's both the "last synced" display
      // value and the cursor the next sync will read. Refresh both local
      // pieces of state from it so "Fetch emails after" doesn't go stale.
      const syncedAt = await getConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT);
      setLastSynced(syncedAt ?? null);
      if (syncedAt) setSyncFromDate(new Date(syncedAt));

      setSyncResult(response.result);
      setShowResults(true);
      showSuccessToast("Sync completed");
    } catch (err) {
      if (err instanceof Error && err.message === "No active banks") {
        showErrorToast("No active banks", "Add a bank in settings to sync");
      } else {
        showErrorToast("Sync failed", err);
      }
    }
  }
```

`gmailSyncMutation`'s `mutationFn` (`hooks/use-gmail-sync.ts:29-38`) already throws `Error("No active banks")` before it can resolve with `result.nobanks === true` — that case stays correctly handled by the `catch` block below, unchanged.

**Verify**: `grep -n "response.result.nobanks" hooks/use-gmail-sync-ui.ts` → no matches; `pnpm typecheck` → exit 0. Manual (operator): run a real "Sync Now" — confirm "Fetch emails after" updates to reflect the just-completed sync (roughly "now"), not the previous cursor.

### Step 4: Replace the inline `style` prop in `StatLine`/`Badge` with static NativeWind tone classes

In `app/gmail-sync.tsx`, add a tone type and a static class lookup near the top of the file (module scope, after imports):

```ts
type BadgeTone = "positive" | "warning" | "negative" | "info" | "muted" | "primary";

// Tone → static NativeWind classes. Values must be literal strings (not
// runtime template interpolation) so the Tailwind/NativeWind build step can
// see them — see CLAUDE.md: "nativewind classes only, no inline style prop".
// The bg-*/15 opacity mirrors the old `${color}22` hex-alpha hack. `info`
// mirrors COLORS.BADGE_BLUE (lib/constants.ts) — no matching Tailwind token
// exists yet, so it's inlined as an arbitrary value instead of adding one
// for a single caller.
const BADGE_TONE_CLASSES: Record<BadgeTone, { bg: string; text: string }> = {
  positive: { bg: "bg-positive/15", text: "text-positive" },
  warning: { bg: "bg-warning/15", text: "text-warning" },
  negative: { bg: "bg-negative/15", text: "text-negative-text" },
  info: { bg: "bg-[#1d4ed826]", text: "text-[#1d4ed8]" },
  muted: { bg: "bg-muted-foreground/15", text: "text-muted-foreground" },
  primary: { bg: "bg-primary/15", text: "text-primary-text" },
};
```

Rewrite `StatLine` and `Badge` (lines 304-347) to take `tone: BadgeTone` instead of `color: string`:

```tsx
function StatLine({
  label,
  count,
  icon,
  tone,
}: {
  label: string;
  count: number;
  icon: string;
  tone: BadgeTone;
}) {
  const { bg, text } = BADGE_TONE_CLASSES[tone];
  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl bg-background px-4 py-3">
      <Text className="text-base">{icon}</Text>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
      <View className={cn("rounded-full px-2 py-0.5", bg)}>
        <Text className={cn("text-[11px] font-semibold", text)}>{count}</Text>
      </View>
    </View>
  );
}

function Badge({ text, tone }: { text: string; tone: BadgeTone }) {
  const { bg, text: textClass } = BADGE_TONE_CLASSES[tone];
  return (
    <View className={cn("rounded-full px-2 py-0.5", bg)}>
      <Text
        className={cn("text-[10px] font-bold uppercase tracking-wide", textClass)}
      >
        {text}
      </Text>
    </View>
  );
}
```

Update the three `StatLine` call sites (around lines 258-275) from `color={COLORS.POSITIVE}` / `COLORS.WARNING` / `COLORS.DANGER` to `tone="positive"` / `"warning"` / `"negative"`.

Update `EmailLogRow`'s color maps (lines 350-367) to return tones instead of hex, then pass `tone={...}` instead of `color={...}` to `Badge`:

```ts
const statusColor: Record<EmailLog["status"], BadgeTone> = {
    [EMAIL_LOG_STATUS.ADDED]: "positive",
    [EMAIL_LOG_STATUS.DUPLICATE]: "warning",
    [EMAIL_LOG_STATUS.FAILED]: "negative",
    [EMAIL_LOG_STATUS.NOT_TRANSACTION]: "muted",
  };
  const parsedLabel = log.parsedBy === "gemini" ? "ai" : log.parsedBy;
  const parsedColor: BadgeTone =
    log.parsedBy === "regex"
      ? "info"
      : log.parsedBy === "gemini"
        ? "primary"
        : "negative";
  const confidenceColor: Record<"high" | "medium" | "low", BadgeTone> = {
    high: "positive",
    medium: "warning",
    low: "negative",
  };
```

And the three `<Badge .../>` call sites become `tone={parsedColor}`, `tone={confidenceColor[log.confidence]}`, `tone={statusColor[log.status]}`. `COLORS` stays imported/used (`COLORS.PRIMARY`/`COLORS.WHITE` are still passed to `ActivityIndicator`'s `color` prop — a third-party native component, the explicitly allowed exception).

**Verify**: `grep -n "style={{" app/gmail-sync.tsx` → no matches; `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual (operator): open a sync-results sheet with added/skipped/failed emails — badges render with the same visual colors as before (opacity may look marginally different; that's expected and fine).

### Step 5 — decision point: make "Enable Gmail Sync" control something real

**Read this before writing any code for this step.** There are two honest ways to close the gap between what the toggle claims and what it does:

- **Option A — build the automatic trigger the copy promises.** Add an `AppState`-driven component mirroring `ForegroundMiniSync` (`app/_layout.tsx:113-141`): on mount and on every foreground transition, check the flag and call `syncGmailTransactions()`. This is what "Enable Gmail Sync... automatic" currently implies. It's a real feature build, not a bugfix: Gmail sync (unlike mini sync) does per-message AI-fallback parsing through Gemini for ambiguous emails, so an unconditional background trigger has real Gemini-quota and battery cost every time the app is foregrounded, on top of the existing pull-to-refresh path. That cost/UX tradeoff deserves an explicit yes from the operator, not an agent's unilateral judgment call.
- **Option B — make the flag control the automatic behavior that already exists, and say so honestly.** The only thing in the app that already syncs Gmail "automatically" is pull-to-refresh (`hooks/use-refresh.ts`'s `useSyncRefresh`). Wire the flag into that (it currently ignores it completely — see Current state §5), stop using it to gate the *manual* "Sync Now" button (manual should not depend on an "auto-sync" preference), and rewrite the switch's copy to describe pull-to-refresh specifically instead of a background trigger that doesn't exist.

**This plan implements Option B by default** — it's smaller, lower-risk, matches the app's existing "Gmail sync is manual/refresh-triggered, mini sync is the only AppState-driven background one" design, and directly fixes the concrete bug found during re-verification (manual "Sync Now" being disabled out of the box for every user). If the operator wants Option A instead, stop here, present both options, and get an explicit answer before writing code — do not build Option A silently.

Implementing Option B:

**5a.** In `hooks/use-auto-refresh-prefs.ts`, flip the default so "never touched the toggle" means "on" (mirrors `useMiniSyncConfig`'s documented default in `hooks/use-mini-sync.ts:23-29` — necessary because `GMAIL_SYNC_USER_ENABLED` is never seeded, so an "off by default" read would silently kill the pull-to-refresh sync every existing user currently gets for free):

```ts
export async function readAutoRefreshPrefs(): Promise<AutoRefreshPrefs> {
  const gmail = await getConfig(CONFIG_KEYS.GMAIL_SYNC_USER_ENABLED);
  return {
    // Default to enabled when the user has never touched the toggle (same
    // pattern as useMiniSyncConfig). The config key is never seeded
    // anywhere else, so an "unset = off" read would silently disable Gmail
    // auto-sync on pull-to-refresh for every existing user the moment this
    // preference starts being consulted for real (Step 5b).
    gmail: gmail !== BOOL_FLAG.OFF,
  };
}
```

Before this step, re-run `grep -rn "GMAIL_SYNC_USER_ENABLED" --include="*.ts" --include="*.tsx" .` (excluding `node_modules`) and confirm the only writer is still `useSetAutoRefreshPref` in this same file — if anything else sets it, STOP and reconsider the default flip.

**5b.** In `hooks/use-refresh.ts`, make `useSyncRefresh` actually consult the flag:

```ts
import { useAutoRefreshPrefs } from "@/hooks/use-auto-refresh-prefs";
// ...
export function useSyncRefresh() {
  const queryClient = useQueryClient();
  const { isConnected } = useGoogleAuth();
  const { data: autoRefreshPrefs } = useAutoRefreshPrefs();
  const { enabled: miniSyncEnabled } = useMiniSyncConfig();
  const miniSync = useMiniSync();
  const [refreshing, setRefreshing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    isConnected().then(setGmailConnected);
  }, [isConnected]);

  // Default true while the query is still loading, matching
  // readAutoRefreshPrefs' "unset = on" semantics.
  const gmailAutoSyncEnabled = autoRefreshPrefs?.gmail ?? true;

  const inFlight = useRef(false);
  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const tasks: Promise<void>[] = [];

      if (gmailConnected && gmailAutoSyncEnabled) {
        tasks.push(
          (async () => {
            try {
              const result = await syncGmailTransactions();
              if (result.nobanks) {
                showErrorToast(
                  "No active banks",
                  "Add a bank in settings to sync",
                );
              } else if (result.added > 0) {
                showSuccessToast("Gmail synced", formatMiniSyncResult(result));
              }
            } catch (err) {
              showErrorToast("Gmail sync failed", err);
            }
          })(),
        );
      }

      if (miniSyncEnabled) {
        // ... unchanged
      }

      await Promise.all(tasks);
      await queryClient.invalidateQueries();
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [queryClient, gmailConnected, gmailAutoSyncEnabled, miniSyncEnabled, miniSync]);

  return { refreshing, onRefresh, gmailConnected };
}
```

**5c.** In `app/gmail-sync.tsx`, stop gating the manual button on the auto-sync flag (`disabled` prop at line 145):

```tsx
<Button
  className="h-12 rounded-xl bg-primary"
  onPress={handleSync}
  disabled={busy || noActiveBanks}
```

And rewrite the `SwitchRow` copy (lines 169-174) to describe what the flag now actually controls:

```tsx
<SwitchRow
  label="Auto-sync on refresh"
  description="When off, pulling to refresh on Home or History won't check Gmail. Sync Now above always works."
  value={autoRefreshEnabled}
  onValueChange={toggleAutoRefresh}
/>
```

**5d.** In `hooks/use-gmail-sync-ui.ts:202`, match the same "unset = on" default so the switch doesn't flash off before the query resolves:

```ts
autoRefreshEnabled: autoRefreshPrefs?.gmail ?? true,
```

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n "!autoRefreshEnabled" app/gmail-sync.tsx` → no matches. Manual (operator): fresh install (or an account that never touched this toggle) — confirm "Sync Now" is enabled as soon as a bank is configured, without ever touching the switch. Turn "Auto-sync on refresh" off, pull-to-refresh on Home — confirm no Gmail network call happens (no "Gmail synced" toast, no error toast) but mini sync (if enabled) still runs. Turn it back on — pull-to-refresh syncs Gmail again. Confirm "Sync Now" still works regardless of the switch's position.

## Test plan

No automated test suite exists in this repo. Machine checks are the greps and `pnpm typecheck`/`pnpm lint` calls in each step's Verify line. Manual smoke test (operator), after all five steps:
1. Airplane mode + "Verify" → failure toast, Gmail stays connected, controls re-enable within ~15s.
2. Change "Fetch emails after" → "Last Synced" unchanged.
3. Real "Sync Now" → "Fetch emails after" updates to reflect the new cursor.
4. Sync-results sheet badges render with correct colors (no visual regression beyond a possibly-slightly-different opacity).
5. Fresh/never-toggled account → "Sync Now" enabled by default; "Auto-sync on refresh" off → pull-to-refresh skips Gmail; on → it doesn't.

## Done criteria

- [ ] `grep -n "await handleSessionExpired" hooks/use-gmail-sync-ui.ts` → exactly one call inside `handleVerify`'s catch-adjacent logic is gated on `res.status === 401 || res.status === 403` or the pre-existing `!token` check — the bare `catch { await handleSessionExpired(); }` is gone
- [ ] `grep -n "setLastSynced(date.toISOString())" hooks/use-gmail-sync-ui.ts` → no matches
- [ ] `grep -n "response.result.nobanks" hooks/use-gmail-sync-ui.ts` → no matches
- [ ] `grep -n "style={{" app/gmail-sync.tsx` → no matches
- [ ] `grep -n "!autoRefreshEnabled" app/gmail-sync.tsx` → no matches
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm dead-code` all clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the four files' cited functions have been restructured since planning (per the drift check).
- `grep -rn "GMAIL_SYNC_USER_ENABLED"` (Step 5a) turns up a writer besides `useSetAutoRefreshPref` — the "unset = on" default assumption needs re-checking against that new writer's intent first.
- The operator wants Option A (background `AppState` trigger) instead of Option B — stop before writing Step 5's code and confirm scope/cost tradeoffs first; Option A is not sketched out in this plan beyond the pointer to `ForegroundMiniSync`.
- `useSyncRefresh`'s Gmail task block has changed shape (e.g. no longer keyed on a plain `gmailConnected` boolean) in a way that makes the `gmailAutoSyncEnabled &&` insertion in Step 5b ambiguous.

## Maintenance notes

- `lib/gmail/auth.ts`'s `getValidAccessToken()` and `hooks/use-sync-state.ts`'s `loadState()` both share the "any failure (including network) ⇒ treat as session expired" pattern this plan fixes at the `handleVerify` call site. Fixing it at the source (distinguishing `invalid_grant`/401 from network failure inside `getValidAccessToken()` itself) would benefit both call sites but touches a shared helper with a wider blast radius — worth a follow-up plan if session-expiry false positives keep showing up elsewhere.
- If Option A (real background Gmail auto-sync) is ever green-lit, budget for the Gemini-quota/battery cost noted in Step 5 and consider debouncing against the pull-to-refresh path so both don't fire back-to-back.
- `BADGE_TONE_CLASSES.info` inlines `COLORS.BADGE_BLUE` as a literal arbitrary-value class because no Tailwind token exists for it. If a second caller ever needs that blue, promote it to `tailwind.config.js` instead of duplicating the literal.
- `BADGE_TONE_CLASSES` hex values are copied from `lib/constants.ts`'s `COLORS` object for the one tone (`info`) that has no semantic token; if `COLORS.BADGE_BLUE` ever changes, this literal needs a matching update — same drift risk the semantic tokens (`positive`, `warning`, etc.) don't have.

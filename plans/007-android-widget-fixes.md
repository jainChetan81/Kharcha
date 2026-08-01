# Plan 007: Android widget fixes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- lib/android-widget-handler.tsx lib/widget.ts widgets/Module.swift`
> If any of the three files changed since planning, re-read the affected
> file and reconcile line numbers before proceeding; if a cited function
> body differs materially from the excerpt below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

Three small, independently-verified issues in the Android/iOS widget path:

1. **`lib/android-widget-handler.tsx` disk cache is dead code.** It does `require("expo-file-system")` and reads `.documentDirectory`. The installed `expo-file-system@55.0.16` (matching `package.json`'s `"expo": "~55.0.9"`) only exports `documentDirectory` (and the other legacy string-path functions) from `expo-file-system/legacy` — the package's default export (`expo-file-system`, resolved via its `"exports"` map to `src/index.ts`) only has `File`, `Directory`, `Paths`, and related types. So `FileSystem.documentDirectory` is always `undefined`, `getCachePath()` always returns `null`, `writeCachedWidgetData` silently no-ops, and `readCachedWidgetData` always returns `null`. Every headless OS-triggered re-render — widget added to the home screen, rotation, resize, or a reboot before the app is opened — renders `PlaceholderView` with `data: null` instead of real spending data. Three other files in this codebase already migrated to the new API and are the pattern to copy: `lib/cloud-backup/icloud.ts`, `lib/export/csv.ts`, `lib/db/backup.ts`.
2. **`lib/widget.ts`'s `totalBudget` uses a bespoke heuristic instead of the canonical helper.** It computes the widget's total budget only `if (budgets.length > 0 && budgets.length >= breakdown.length)`, otherwise reports `null` (hiding the budget/projection bar). The canonical `getTotalMonthlyBudget()` in `lib/db/index.ts:1863-1876` — already used by the home screen via `hooks/use-transactions.ts`'s `useTotalMonthlyBudget()` — just does `COALESCE(SUM(budgets.amount), 0)` unconditionally. Any user who budgets fewer categories than they spend in (e.g. budgets only "Food" but also spends in "Travel" and "Shopping" this month) sees the widget silently drop the budget bar while the home screen, using the same underlying data, shows a real number. This is a correctness/consistency bug, not a deliberate feature.
3. **`widgets/Module.swift`'s standalone `reloadAllTimelines` export is dead code.** It's exported from the native `ReactNativeWidgetExtension` Expo module but has zero JS call sites — `setWidgetData` (the only function JS actually calls, from `syncIOS` in `lib/widget.ts:86-94`) already calls `WidgetCenter.shared.reloadAllTimelines()` internally at the end of its body. Low severity, but it's unused native surface area worth trimming while touching this file for context, and a Swift-unfamiliar contributor reading this module could reasonably assume JS drives reloads through the standalone function too.

All three were re-verified against the current files in this repo (see excerpts below and the `expo-file-system` package inspection under "Current state") — none are stale.

## Current state

- `lib/android-widget-handler.tsx:18-55` — the broken disk cache, in full:
  ```ts
  function getCachePath(): string | null {
    try {
      const FileSystem = require("expo-file-system") as {
        documentDirectory: string | null;
      };
      if (!FileSystem.documentDirectory) return null;
      return `${FileSystem.documentDirectory}widget-data.json`;
    } catch {
      return null;
    }
  }

  async function readCachedWidgetData(): Promise<AndroidWidgetData | null> {
    try {
      const path = getCachePath();
      if (!path) return null;
      const FileSystem = require("expo-file-system") as {
        readAsStringAsync: (path: string) => Promise<string>;
      };
      const json = await FileSystem.readAsStringAsync(path);
      return JSON.parse(json) as AndroidWidgetData;
    } catch {
      return null;
    }
  }

  async function writeCachedWidgetData(data: AndroidWidgetData): Promise<void> {
    try {
      const path = getCachePath();
      if (!path) return;
      const FileSystem = require("expo-file-system") as {
        writeAsStringAsync: (path: string, data: string) => Promise<void>;
      };
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
    } catch {
      // non-critical
    }
  }
  ```
  Confirmed broken by inspecting the installed package directly:
  ```
  $ grep -A3 '"exports"' node_modules/expo-file-system/package.json
    "exports": {
      ".": { "types": "./build/index.d.ts", "default": "./src/index.ts" },
      "./legacy": { "types": "./build/legacy/index.d.ts", "default": "./src/legacy/index.ts" }
    }
  $ cat node_modules/expo-file-system/src/index.ts
  export * from './FileSystem';   // ← exports File, Paths, Directory — no documentDirectory
  ...
  $ grep -rn "documentDirectory" node_modules/expo-file-system/build/legacy/*.d.ts
  legacy/FileSystem.d.ts:7:export declare const documentDirectory: string | null;   // ← only here
  ```
  `readCachedWidgetData()` is called from `widgetTaskHandler` (same file, line 111), which is registered via `registerWidgetTaskHandler(widgetTaskHandler)` in `index.js:5` (guarded by `Platform.OS === "android"`, so a static top-level import of `expo-file-system` in this file only ever loads on Android — safe, and consistent with how `icloud.ts`/`csv.ts`/`backup.ts` import it statically).

- The reference pattern already used elsewhere in the repo — `lib/export/csv.ts:1-4,48-49`:
  ```ts
  import { File, Paths } from "expo-file-system";
  ...
  const file = new File(Paths.cache, `${filename}.csv`);
  file.write(csv);
  ```
  and `lib/cloud-backup/icloud.ts:14,24-26,58-59,82`:
  ```ts
  import { Directory, File, Paths } from "expo-file-system";
  ...
  function getBackupFile(): File {
    return new File(Paths.document, BACKUP_DIR, BACKUP_FILENAME);
  }
  ...
  if (!file.exists) return null;
  ...
  const bytes = await file.bytes();
  ```
  From the type declarations (`node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts`): `File#exists` is a synchronous boolean getter, `File#write(content: string | Uint8Array)` is synchronous and creates the file if it doesn't exist (see `csv.ts` calling it directly on a freshly-constructed `File` with no prior `.create()`), and `File#text(): Promise<string>` reads the full contents as a string.

- `lib/widget.ts:76-79` — the heuristic:
  ```ts
  totalBudget:
    budgets.length > 0 && budgets.length >= breakdown.length
      ? budgets.reduce((sum, b) => sum + b.amount, 0)
      : null,
  ```
  `budgets` and `breakdown` both come from `Promise.all` a few lines up (`getBudgets()` and `getCategoryBreakdown(yearMonth)`, `lib/widget.ts:39-55`).

- `lib/db/index.ts:1863-1876` — the canonical helper this should call instead:
  ```ts
  export async function getTotalMonthlyBudget(): Promise<number> {
    try {
      const rows = await db
        .select({ total: sql<number>`COALESCE(SUM(${budgets.amount}), 0)` })
        .from(budgets);
      return Number(rows[0]?.total ?? 0);
    } catch (error) {
      logFirebaseError(error, {
        error_type: ERROR_TYPE.DB,
        operation: "getTotalMonthlyBudget",
      });
      throw error;
    }
  }
  ```
  Note it takes **no arguments** and sums across all budgets regardless of month/category — same semantics the widget wants (a flat total, not filtered to categories with spend this month). It's already imported into `lib/db/index.ts`'s re-export surface and consumed by `hooks/use-transactions.ts:30,188` (`useTotalMonthlyBudget`), which is what the home screen uses. `lib/widget.ts:12` already imports `getBudgets` from `@/lib/db/budgets` — swap the import source, not just the call.

- `widgets/Module.swift:1-19` — the whole file (tracked source under `widgets/`, not the gitignored generated `ios/` dir — this is the editable location per `app.json`'s `"widgets"` config plugin entry):
  ```swift
  import ExpoModulesCore
  import WidgetKit

  public class ReactNativeWidgetExtensionModule: Module {
    public func definition() -> ModuleDefinition {
      Name("ReactNativeWidgetExtension")

      Function("reloadAllTimelines") { () -> Void in
        WidgetCenter.shared.reloadAllTimelines()
      }

      Function("setWidgetData") { (json: String) -> Void in
        let defaults = UserDefaults(suiteName: "group.com.chetanjain.kharcha")
        defaults?.set(json, forKey: "widgetData")
        defaults?.synchronize()
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
  ```
  Confirmed zero JS call sites: `grep -rn "reloadAllTimelines" --include="*.ts" --include="*.tsx" --include="*.js" .` (excluding `node_modules`) only matches this file's own definition and internal use.

- Repo conventions in play: no `any` types; never run pnpm commands yourself — tell the operator which command to run and wait; `ios/`/`android/` are generated/gitignored (does not apply here — `widgets/` is the tracked source).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|----------------------|
| Typecheck | `pnpm typecheck` | exit 0               |
| Lint      | `pnpm lint`      | exit 0               |
| Dead code | `pnpm dead-code` | no new findings (the `@public` tag on `updateAndroidWidgets` in `lib/android-widget-handler.tsx` must stay — it suppresses a real knip false positive, unrelated to this plan) |

There is no automated test harness for the widget path (native rendering, no `pnpm test` script covers it) — verification is manual/on-device, called out per step.

## Scope

**In scope**:
- `lib/android-widget-handler.tsx` (`getCachePath`, `readCachedWidgetData`, `writeCachedWidgetData`)
- `lib/widget.ts` (`totalBudget` field only, plus its import list)
- `widgets/Module.swift` (remove the standalone `reloadAllTimelines` `Function` block only)

**Out of scope** (do NOT touch):
- `components/android-widget.tsx` (the widget UI/rendering components — `AndroidWidgetData` type, `SmallSpendWidget`, `MediumSpendWidget`) — unaffected by these fixes.
- The debounce/coalescing logic in `lib/android-widget-handler.tsx` (`HANDLER_DEBOUNCE_MS`, `lastRenderedAt`) and `lib/widget.ts` (`DEBOUNCE_MS`, `fireDebouncedSync`, `runningSync` serialization) — correct as-is, not part of this plan.
- `widgets/widget.swift`, `widgets/Attributes.swift`, `widgets/Info.plist` — the SwiftUI widget view and its config; not touched by any of the three findings.
- `syncIOS` in `lib/widget.ts:86-94` — it calls `setWidgetData` correctly already; no change needed there.
- Any other `require("expo-file-system")` or legacy-API usage you find elsewhere in the repo — note it in your report instead of fixing it (out of scope for this plan; the audit only flagged this one file).

## Git workflow

- Branch: `fix/007-android-widget-fixes`
- Commit message style: `fix(widget): migrate to expo-file-system File/Paths API, fix budget heuristic, drop dead native export`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Migrate the widget disk cache to the `File`/`Paths` API

In `lib/android-widget-handler.tsx`, add a top-level import (this file is only ever loaded on Android — see "Current state" above — so a static `expo-file-system` import is safe and matches the pattern in `icloud.ts`/`csv.ts`/`backup.ts`):

```ts
import { File, Paths } from "expo-file-system";
```

Replace `getCachePath` with a function returning a `File` instance instead of a string path, and rewrite the two read/write functions to use it:

```ts
const CACHE_FILENAME = "widget-data.json";

function getCacheFile(): File {
  return new File(Paths.document, CACHE_FILENAME);
}

async function readCachedWidgetData(): Promise<AndroidWidgetData | null> {
  try {
    const file = getCacheFile();
    if (!file.exists) return null;
    const json = await file.text();
    return JSON.parse(json) as AndroidWidgetData;
  } catch {
    return null;
  }
}

async function writeCachedWidgetData(data: AndroidWidgetData): Promise<void> {
  try {
    getCacheFile().write(JSON.stringify(data));
  } catch {
    // non-critical
  }
}
```

Notes:
- `file.write()` is synchronous and creates the file if it doesn't already exist (confirmed by `csv.ts:48-49` calling it on a freshly-constructed `File` with no prior `.create()`) — no separate create step needed.
- Keep `writeCachedWidgetData`'s signature `async (data): Promise<void>` even though the body is now synchronous — `updateAndroidWidgets` (line ~88) already does `await writeCachedWidgetData(data)`, and changing the signature would ripple into that call site for no benefit.
- Remove the now-unused `try/catch`-wrapped `require` casts; there should be no remaining `require("expo-file-system")` in this file after this step (`grep -n 'require("expo-file-system")' lib/android-widget-handler.tsx` → no output).
- Do not touch `renderWidget`, `updateAllWidgets`, `updateAndroidWidgets`, or `widgetTaskHandler` — only the three cache functions and the new import.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n 'require("expo-file-system")' lib/android-widget-handler.tsx` → no output; `grep -n 'from "expo-file-system"' lib/android-widget-handler.tsx` → one line, the new top-level import.

### Step 2: Use the canonical `getTotalMonthlyBudget()` in the widget payload

In `lib/widget.ts`:

1. Change the import at line 12 from `import { getBudgets } from "@/lib/db/budgets";` to `import { getTotalMonthlyBudget } from "@/lib/db";` — check first whether `getBudgets` is still needed elsewhere in this file (it currently is not, once `totalBudget` no longer reads `budgets`/`breakdown`-derived totals — but `breakdown` itself, from `getCategoryBreakdown`, is still needed for the `categories` field, so only the `budgets` variable becomes unused, not `breakdown`).
2. In the `Promise.all` at lines 39-55, replace the `getBudgets()` call with `getTotalMonthlyBudget()` and rename the destructured variable from `budgets` to `totalBudget` (or similar) to avoid confusion with the array it used to hold.
3. Replace the `totalBudget` field (lines 76-79) with the direct value:
   ```ts
   totalBudget: totalBudget > 0 ? totalBudget : null,
   ```
   Keep the `> 0 ? … : null` guard — `getTotalMonthlyBudget()` returns `0` (not `null`) when there are no budgets at all, and the widget UI (`components/android-widget.tsx`) expects `null` to mean "no budget set, hide the bar," same contract as before. Do not resurrect the `budgets.length >= breakdown.length` comparison — that's exactly the bug being fixed.

**Verify**: `pnpm typecheck` → exit 0 (confirms `getBudgets`/`getBudgets`-typed imports are fully removed or still correctly used, no dangling reference); `pnpm lint` → exit 0; `grep -n "breakdown.length" lib/widget.ts` → no output (the heuristic comparison is gone); `grep -n "getTotalMonthlyBudget" lib/widget.ts` → one import line + one call site.

### Step 3: Remove the dead `reloadAllTimelines` native export

In `widgets/Module.swift`, delete the standalone `Function("reloadAllTimelines") { ... }` block (lines 8-10), keeping `setWidgetData` (which already calls `WidgetCenter.shared.reloadAllTimelines()` at the end of its own body) untouched. The file should read:

```swift
import ExpoModulesCore
import WidgetKit

public class ReactNativeWidgetExtensionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReactNativeWidgetExtension")

    Function("setWidgetData") { (json: String) -> Void in
      let defaults = UserDefaults(suiteName: "group.com.chetanjain.kharcha")
      defaults?.set(json, forKey: "widgetData")
      defaults?.synchronize()
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
```

This is native Swift with no TypeScript build step to verify against — confirm by inspection and by re-running the dead-code grep.

**Verify**: `grep -n "reloadAllTimelines" widgets/Module.swift` → exactly one match (inside `setWidgetData`); `grep -rn "reloadAllTimelines" --include="*.ts" --include="*.tsx" --include="*.js" . | grep -v node_modules` → no output (already had none, confirming nothing depended on the removed function).

## Test plan

No automated tests cover the widget path. Manual verification (operator-run, on a real device or simulator — the executor should describe these steps in the final report but not attempt them without operator confirmation, since they require `pnpm android`/`pnpm ios` and physical widget interaction):

- **Step 1 (Android cache)**: Build and install the app, add the small or medium widget to the home screen without opening the app first (or force-stop the app, then rotate/resize the widget) — it should show real spending data, not the empty placeholder. `adb shell run-as com.chetanjain.kharcha ls files` (or equivalent) can confirm `widget-data.json` exists at the app's document directory after the app has run once.
- **Step 2 (budget heuristic)**: In-app, set a budget for one category only (e.g. "Food"), then log an expense in a second, unbudgeted category (e.g. "Travel") this month. Confirm the Android/iOS widget's projection/budget bar now shows a non-null total budget, matching what the home screen shows for `useTotalMonthlyBudget()`.
- **Step 3 (native export removal)**: `pnpm ios` (or a full EAS build) completes without a Swift compile error, and the iOS widget still updates after a transaction is added (confirms `setWidgetData`'s internal `reloadAllTimelines()` call still fires).

## Done criteria

- [ ] `lib/android-widget-handler.tsx` has zero `require("expo-file-system")` calls; uses `import { File, Paths } from "expo-file-system"` instead
- [ ] `lib/widget.ts`'s `totalBudget` field is computed from `getTotalMonthlyBudget()`, not a `budgets.length >= breakdown.length` comparison
- [ ] `widgets/Module.swift` no longer exports a standalone `reloadAllTimelines` function
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm dead-code` all exit 0 / report no new findings
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `File#write()` in the installed `expo-file-system` version turns out to require an explicit `.create()` call first (re-check `node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts` and `csv.ts`'s usage if `pnpm typecheck`/a manual run disagrees with this plan's assumption).
- `getTotalMonthlyBudget()`'s signature or semantics have changed since this plan was written (re-read `lib/db/index.ts` around line 1863).
- Removing `reloadAllTimelines` from `Module.swift` breaks the iOS build in a way unrelated to the deletion itself (e.g. a config plugin or `Attributes.swift`/`widget.swift` references it) — re-grep before assuming it's safe.

## Maintenance notes

- If a future feature needs to force a widget reload from JS without going through `setWidgetData` (e.g. a "refresh widget" debug button), re-add a minimal JS-callable `reloadAllTimelines` at that point rather than resurrecting this one speculatively.
- Any other file in the repo still using bare `require("expo-file-system")` for legacy string-path APIs (`documentDirectory`, `readAsStringAsync`, etc.) has the same silent-failure bug as finding 1 — worth a repo-wide `grep -rn "expo-file-system/legacy\|require(\"expo-file-system\")"` sweep outside this plan's scope.

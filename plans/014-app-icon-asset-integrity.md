# Plan 014: Fix app icon/splash asset integrity (missing file, format mismatch)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat HEAD -- app.json assets/`
> If `app.json`'s `expo.android.adaptiveIcon` block or the `assets/` file
> list has changed since this plan was written, re-read both before
> proceeding; STOP if `android-icon-background.png` has reappeared (someone
> may already be mid-fix) or if the adaptive icon config has been
> restructured (e.g. moved to a config plugin).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f5a9dc9`, 2026-08-01

## Why this matters

This is not a "make the icons prettier" plan — the existing app icon/splash
brand assets were checked visually and are a coherent, professionally
finished mark (a gradient rupee glyph on a dark rounded-square ground, used
consistently across icon/splash/monochrome/feature-graphic). What's actually
broken is asset **integrity**, found while auditing what "update the icons"
would even mean here:

1. `app.json`'s `expo.android.adaptiveIcon.backgroundImage` points at
   `./assets/android-icon-background.png` — a file that **does not exist on
   disk**. `git log --diff-filter=D -- assets/android-icon-background.png`
   shows it was a real, tracked 101,340-byte PNG that got deleted in commit
   `7a3913c` ("feat: parse transactions on-device via Gemini…", an unrelated
   feature commit — this was almost certainly an accidental `git add -A`
   sweep, not an intentional icon change) while the `app.json` reference was
   never cleaned up. A missing `backgroundImage` referenced by
   `adaptiveIcon` fails Android prebuild/asset-resolution — this is a
   **latent Android build breakage**, not a cosmetic issue.
2. `assets/favicon.png` is not actually a PNG: `file assets/favicon.png`
   reports `JPEG image data … 1024x1024 … progressive`. JPEG has no alpha
   channel, so anything relying on this file for a transparent favicon
   (web export, PWA manifest) silently gets an opaque background instead.
3. `assets/android-icon-foreground.png` (1024×1024) and
   `assets/android-icon-monochrome.png` (2048×2048) are the two other layers
   of the same Android adaptive icon but are provided at mismatched native
   resolutions. Android will scale them, so this likely isn't a hard
   failure, but it's asset-hygiene drift worth normalizing while the other
   two files in this same config block are already being touched.

## Current state

- `app.json` (`expo.android.adaptiveIcon`):
  ```json
  "adaptiveIcon": {
    "backgroundColor": "#E6F4FE",
    "foregroundImage": "./assets/android-icon-foreground.png",
    "backgroundImage": "./assets/android-icon-background.png",
    "monochromeImage": "./assets/android-icon-monochrome.png"
  }
  ```
  `backgroundColor` is also present — Expo's adaptive icon accepts either a
  flat color OR an image for the background layer; both being set means
  `backgroundImage` wins when present, so today's *actual* behavior (with
  the file missing) is whatever expo-cli's prebuild does on a missing asset
  path — treat as broken, do not assume it silently falls back to
  `backgroundColor`.
- `assets/` directory contents today (verified via `file(1)`, not just
  extension):
  ```
  assets/icon.png                      PNG, 1024x1024   (git blob 36c5c3e6…, IDENTICAL to splash-icon.png)
  assets/splash-icon.png               PNG, 1024x1024   (git blob 36c5c3e6…, IDENTICAL to icon.png — appears intentional, both show the same mark)
  assets/android-icon-foreground.png   PNG, 1024x1024
  assets/android-icon-monochrome.png   PNG, 2048x2048   (2x the foreground's resolution)
  assets/favicon.png                   JPEG, 1024x1024  (wrong format for its .png extension)
  assets/feature-graphic.png           PNG, 1024x495    (Play Store feature graphic — correct 2.07:1 ratio, fine as-is)
  assets/android-icon-background.png   MISSING — referenced by app.json, not present in the working tree
  ```
- `git log --all --diff-filter=D --oneline -- assets/android-icon-background.png` → `7a3913c`, confirming the deletion commit.
- No config plugin or script currently regenerates these assets (no `expo-icon`/`app-icon` generator config found in `package.json` or `app.json`) — they are hand-placed static files.

## Commands you will need

| Purpose                        | Command                              | Expected on success |
|---------------------------------|--------------------------------------|----------------------|
| Confirm real file type          | `file assets/<name>.png`             | reports `PNG image data`, not `JPEG` |
| Confirm dimensions              | `file assets/<name>.png` (includes WxH) | matches the sibling layer it's paired with |
| Verify app.json parses          | `node -e "JSON.parse(require('fs').readFileSync('app.json'))"` | exits 0, no output |
| Verify prebuild resolves assets | `npx expo prebuild --platform android --no-install --clean` (run in a scratch copy or be ready to discard `android/` — this is normally gitignored/regenerated, confirm with `git status` before and after) | completes without an "asset not found" / ENOENT error referencing the icon files |
| Typecheck (unrelated but cheap) | `pnpm typecheck`                     | exit 0 (this plan touches no `.ts`/`.tsx`, expect unchanged from baseline) |

## Scope

**In scope**:
- `assets/android-icon-background.png` (restore or regenerate)
- `assets/favicon.png` (fix format)
- `assets/android-icon-monochrome.png` and/or `assets/android-icon-foreground.png` (normalize resolution)
- `app.json`'s `expo.android.adaptiveIcon` / `expo.web` (or wherever `favicon.png` is referenced) only if the fix requires a path/config change

**Out of scope** (do NOT touch):
- `assets/icon.png`, `assets/splash-icon.png`, `assets/feature-graphic.png` — already correct, do not "improve" them; they were visually reviewed and are a finished, coherent brand mark.
- Any redesign of the brand mark itself. This plan is an integrity fix, not a rebrand. The operator has not asked for a new visual direction, and no image-generation tool was used to produce these findings — do not invent new artwork.
- The `Icon` wrapper / `lucide-react-native` in-app UI icon system (`components/ui/icon.tsx`, `components/ui/empty-state.tsx`) — audited separately and found already consistent (a single `Icon` wrapper component, centrally used, with `size-4`/`size-5`/`size-6`/`size-12` used contextually across ~55 call sites — no drift found). Nothing to fix there.

## Git workflow

- Branch: `fix/014-app-icon-asset-integrity`
- Commit style: `fix(assets): restore missing android-icon-background.png, fix favicon.png format`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Recover or regenerate `android-icon-background.png`

First try recovery from git history — the pre-deletion blob still exists:
```bash
git log --all --diff-filter=D --oneline -- assets/android-icon-background.png
# -> 7a3913c
git show 7a3913c~1:assets/android-icon-background.png > assets/android-icon-background.png
file assets/android-icon-background.png   # confirm it reports PNG image data
```
Open the recovered file (or ask the operator to look at it) to confirm it still matches the current brand mark — it was deleted mid-June and the rest of the icon set may have changed since. If it looks stale/mismatched, STOP and ask the operator whether to (a) restore this file as-is, (b) regenerate a background layer from the current `icon.png`'s background color (`#0a0a0a`-ish dark, per `app.json`'s `splash.backgroundColor`) as a flat-color PNG, or (c) drop `backgroundImage` entirely and rely on `adaptiveIcon.backgroundColor` (`#E6F4FE`) alone — this is a legitimate one-line config simplification if a flat color is genuinely what's wanted, but changes the adaptive icon's visual background from dark to light, which is a real product decision, not yours to make silently.

**Verify**: `file assets/android-icon-background.png` → `PNG image data`; `git status` shows the file as either restored (matches HEAD~ content) or newly regenerated, not still missing.

### Step 2: Fix `favicon.png`'s format

Convert the existing JPEG content to a real PNG (preserves the current image, just fixes the container format so it can carry transparency going forward):
```bash
# using whatever image tool is available locally, e.g.:
sips -s format png assets/favicon.png --out assets/favicon.png   # macOS
# or: python3 -c "from PIL import Image; Image.open('assets/favicon.png').save('assets/favicon.png', 'PNG')"
```
If no local conversion tool is available in the executor's environment, report that back rather than leaving the file mismatched — do not silently skip this step.

**Verify**: `file assets/favicon.png` → `PNG image data`, not `JPEG`.

### Step 3: Normalize adaptive-icon layer resolutions

Resize `android-icon-monochrome.png` down to 1024×1024 to match `android-icon-foreground.png` (matching resolution is the safer normalization direction — upscaling the foreground to 2048 would soften it, downscaling the monochrome loses nothing visible since it's a flat single-color mask):
```bash
sips -Z 1024 assets/android-icon-monochrome.png   # macOS; or ImageMagick `convert -resize 1024x1024`
```

**Verify**: `file assets/android-icon-monochrome.png` reports `1024 x 1024`, matching `assets/android-icon-foreground.png`.

### Step 4: Confirm the fix with a prebuild dry run

```bash
git status --short assets/ android/ 2>&1   # note current android/ state before running (it's gitignored/generated — confirm this first)
npx expo prebuild --platform android --no-install --clean
```
Confirm no error/warning about a missing icon asset. If `android/` isn't normally present in this checkout (per `.gitignore`, it's CNG-generated), clean it up afterward if the executor's workflow doesn't otherwise want a native folder sitting around: check with the operator before deleting anything not already gitignored.

**Verify**: prebuild completes without an ENOENT/asset-resolution error mentioning `android-icon-background.png`, `favicon.png`, or `android-icon-monochrome.png`.

## Test plan

- [ ] `file` on all three touched assets reports the expected format/dimensions (Steps 1–3's Verify lines)
- [ ] `npx expo prebuild --platform android --no-install --clean` completes cleanly (Step 4)
- [ ] Visual check: open the recovered/regenerated `android-icon-background.png` next to `icon.png`/`splash-icon.png` and confirm it's not a jarring mismatch (e.g. wrong hue) — this is a judgment call, not a scriptable check

## Done criteria

- [ ] `assets/android-icon-background.png` exists and is a valid PNG (`git ls-files assets/` shows it tracked again)
- [ ] `app.json`'s `adaptiveIcon.backgroundImage` reference resolves to a real file (no dangling path)
- [ ] `assets/favicon.png` is a real PNG (`file` confirms), not a JPEG
- [ ] `android-icon-foreground.png` and `android-icon-monochrome.png` report matching dimensions
- [ ] `npx expo prebuild --platform android --no-install --clean` succeeds

## STOP conditions

Stop and report back (do not improvise) if:

- The recovered `android-icon-background.png` (from git history) looks visually stale or mismatched against the current `icon.png`/`splash-icon.png` — this needs an operator decision (restore as-is / regenerate flat-color / drop the image and use `backgroundColor` alone), not a unilateral pick.
- No image-conversion tool (`sips`, ImageMagick, PIL/Pillow, etc.) is available in the executor's environment to fix `favicon.png`'s format or resize the monochrome layer — report the gap rather than leaving the file broken or attempting a lossy workaround.
- `npx expo prebuild` fails for a reason unrelated to these three assets — that's a separate, pre-existing issue; report it rather than trying to fix it under this plan's scope.

## Maintenance notes

- If this app ever adopts an icon-generation pipeline (e.g. `expo-icon`, a design-tool export script), this whole category of "config references a file that quietly stopped existing" goes away — worth a `plans/README.md` "Direction findings" entry if the operator wants to consider it, but not in scope here.
- The in-app UI icon system (`lucide-react-native` via `components/ui/icon.tsx`) was audited as part of scoping this plan and found already consistent — no action needed there. See "Out of scope" above for what was checked.

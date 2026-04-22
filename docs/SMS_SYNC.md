# sms sync

android-only. user shares a bank SMS from their messages app into kharcha; the raw text is parsed locally and dropped into a prefilled transaction form to confirm.

supports **hdfc, axis, indusind** via `lib/parsers/`. anything else falls through to manual entry with the shared text prefilled in the note.

no permissions. no background work. no history backfill. one message at a time, user-initiated.

---

## architecture

```
app/
  _layout.tsx            ShareIntentProvider wrap + ShareIntentListener
  sms-sync.tsx           settings + onboarding (android-only; redirects on iOS)
  sms-forward.tsx        intent landing — parse, prefill, save

lib/parsers/             shared bank regex parsers (also used by the AI parse sheet)
  index.ts               parseMessage(text) → ParsedTransaction | null
  hdfc.ts axis.ts indusind.ts utils.ts

hooks/use-feature-flags.ts   useSmsSyncEnabled (flag ∧ isAndroid), useSmsSyncActive (+ user toggle)
hooks/use-auto-refresh-prefs.ts  prefs.sms boolean (defaults ON on first read)
```

native wiring is handled by the `expo-share-intent` config plugin declared in `app.json`. no manual intent-filter, no `+native-intent.tsx`.

---

## share flow

```
user opens bank SMS in Messages app
  → taps Share → picks Kharcha
  → Android fires ACTION_SEND (text/plain)
  → expo-share-intent captures EXTRA_TEXT, exposes via useShareIntent()
  → ShareIntentListener (in _layout.tsx) → router.push("/sms-forward?text=…")
  → sms-forward calls parseMessage(text)
     ├─ parsed → TransactionForm prefilled (amount, merchant, date, type)
     └─ null   → TransactionForm empty with raw SMS in note
  → user saves → useInsertTransaction → home
```

cold-start, foreground-resume, and locked-app shares all work: the share intent state persists in `ShareIntentProvider` until the listener calls `resetShareIntent()`.

---

## app.json

```json
["expo-share-intent", {
  "iosActivationRules": { "NSExtensionActivationSupportsText": false },
  "androidIntentFilters": ["text/*"],
  "disableIOS": true
}]
```

iOS is disabled at the plugin level — no share extension gets built, and kharcha does not appear in the iOS share sheet.

---

## feature flag

`sms_sync_enabled` in the backend `/feature-flags` response. **defaults to `true`** on the client (unlike `gmail_sync_enabled` / `device_sync_enabled` which default false) — the share target is zero-permission and user-initiated, so server gating isn't load-bearing.

`useSmsSyncEnabled()` folds in `isAndroid` — the sync section in profile hides entirely on iOS.

---

## user toggle

`SMS_SYNC_USER_ENABLED` in the config table. defaults ON if unset. when off:

- `useSmsSyncActive()` returns false
- `/sms-forward` redirects to `/sms-sync` instead of rendering the form
- the share target itself is still registered at the OS level (can't be removed at runtime)

---

## parsing

`lib/parsers/index.ts` tries each parser in sequence and returns the first match:

| bank | file | handles |
|---|---|---|
| hdfc | hdfc.ts | debit alerts |
| axis | axis.ts | UPI debit/credit, credit card, generic debit, subject-line debit/credit |
| indusind | indusind.ts | UPI debit/credit, IMPS credit |

parsed shape: `{ amount: number; merchant: string; date: "yyyy-MM-dd"; type: "expense" | "income" }`.

`sms-forward.tsx` maps this into `TransactionFormValues`:

- date → `${parsed.date} 12:00` (DATE_TIME_FORMAT needs time)
- sourceId → default UPI source for expenses, null for income
- note → `SMS_SYNC_NOTE` + raw SMS text (provenance)
- parsedBy → `PARSED_BY.REGEX`

duplicate detection: same `findDuplicateTransaction(date, amount, merchant)` check as the `/add` screen.

---

## screens

- **sms-sync.tsx** — description, 3 `StepCard`s (open → share → confirm), enable toggle. nothing else.
- **sms-forward.tsx** — intent landing. banner indicates parsed vs. couldn't-parse. `TransactionForm` with prefilled values. duplicate sheet on save.
- **profile.tsx** — "SMS Sync" NavRow in the Sync section, gated by `useSmsSyncEnabled()`.

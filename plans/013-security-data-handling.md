# Plan 013: Security and data-handling hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- app/_layout.tsx lib/db/subscriptions.ts app/gmail-sync.tsx lib/clipboard.ts hooks/use-transactions.ts lib/env.ts lib/export/csv.ts`
> If any of these seven files changed since planning, re-read the affected
> file and reconcile line numbers before proceeding. Two of these files
> (`app/_layout.tsx`, `lib/db/subscriptions.ts`) are also touched by
> `plans/002-boot-sequence-failure-fallback.md`, but at disjoint locations —
> plan 002 edits the boot `useEffect` (lines 174-198) and splash-hide effect;
> this plan edits the separate Crashlytics `useEffect` (lines 214-224). If
> plan 002 has landed, re-check those line numbers shifted before assuming
> 214-224 is still the Crashlytics effect. STOP if a cited function body
> differs materially from the excerpt below rather than just having moved.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: audit-derived, current HEAD (`f5a9dc9`)

## Why this matters

Six findings, one repeating pattern: this codebase already knows how to do
this right in one place and forgets to do it in the neighboring one.
`lib/clipboard.ts` has a PII-masking utility — applied to the clipboard copy
button but not the on-screen text two lines below it. `lib/env.ts` has an
explicit, well-written threat-model comment for `GEMINI_API_KEY` — and none
for `MINI_API_TOKEN` sitting four lines under it, despite the mini token
being strictly more dangerous (read *and* write access to the user's full
transaction history, vs. a proxy-restricted AI key). `logEvent` calls
elsewhere in the app pass ids, types, and counts — except one, which passes
a raw rupee amount to Firebase Analytics. None of these are new capabilities
to build; each is finishing a pattern the codebase already started. The one
genuine judgment call is Crashlytics (always-on collection, no opt-out) —
that step is written up as an explicit decision with a recommendation
rather than a mechanical fix.

## Current state

All six re-verified by reading the current files in full (not trusting the
audit's line numbers blindly) — details below.

### 1. Unmasked bank email snippet on screen (`app/gmail-sync.tsx`)

`EmailLogRow`'s "Email snippet" card renders raw `log.body` right next to a
Copy button that masks the same value before it touches the clipboard —
`app/gmail-sync.tsx:424-447`:

```tsx
<Pressable
  onPress={() => copyMaskedToClipboard(log.body ?? "", "Snippet")}
  accessibilityRole="button"
  className="flex-row items-center gap-1 rounded-md bg-background px-2 py-1"
>
  <Icon as={Copy} className="size-3 text-primary-text" />
  <Text className="text-[10px] font-medium text-primary-text">Copy</Text>
</Pressable>
</View>
<Text className="text-[10px] text-foreground" selectable>
  {log.body}                                        {/* ← raw, unmasked */}
</Text>
```

The masking logic already exists in `lib/clipboard.ts:17-40`
(`maskSensitivePii`) — it masks card numbers, account numbers, UPI IDs,
phone numbers, and OTP/CVV codes — but it is a module-private function; only
the composed `copyMaskedToClipboard` (line 42-44) is exported:

```ts
function maskSensitivePii(text: string): string { ... }   // not exported

export async function copyMaskedToClipboard(value: string, label: string) {
  return copyToClipboard(maskSensitivePii(value), label);
}
```

So the on-screen `<Text>` has no way to reuse the masking today without
either exporting `maskSensitivePii` directly or adding a second exported
wrapper.

### 2. Precise monetary amount shipped to Firebase Analytics (`lib/db/subscriptions.ts`)

`processSubscriptions()` logs the exact SIP amount on every investment
subscription post — `lib/db/subscriptions.ts:328-333`:

```ts
logEvent(FIREBASE_EVENTS.SIP_POSTED, {
  subscription_id: sub.id,
  holding_id: sub.holding_id,
  kind: sub.investment_kind ?? INVESTMENT_KIND.BUY,
  amount: sub.amount,                                 // ← line 332
});
```

Confirmed by grep that this is the only `logEvent(...)` call in the entire
app that passes an `amount` field: `BUDGET_SET` (`hooks/use-budgets.ts:31`)
logs no params at all, and every other file with both a nearby `amount`
variable and a `logEvent` call (checked: `use-add-transaction.ts`,
`use-holdings.ts`, `use-subscriptions.ts`, `use-gmail-sync.ts`, etc.) does
not forward it into the event. `RECURRING_TRANSACTION_POSTED`, logged three
lines below this one (line 336-338), is the sibling event for the same
action and correctly logs only `type`.

### 3 & 4. `MINI_API_TOKEN` — no threat-model comment, at both its definition and its call site

`lib/env.ts:14-27`, the two adjacent secrets:

```ts
// Deliberate trade-off: this key ships in the client bundle (EXPO_PUBLIC_* is
// inlined into the JS, so it is extractable from the IPA/APK). Acceptable ONLY
// as a key restricted in Google Cloud to the Generative Language API + this
// app's bundle id / package name. If this app ever gets a public
// (non-internal) release, move Gemini calls behind an authed proxy first.
// AI parsing is optional — a missing key degrades gracefully
// (callGemini returns NO_API_KEY), so we don't block startup with an alert.
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
// Mini sync (personal Mac mini pipeline). Optional — if either value is empty,
// the feature is treated as not configured and degrades to a no-op.
const MINI_API_URL = process.env.EXPO_PUBLIC_MINI_API_URL ?? "";
const MINI_API_TOKEN = process.env.EXPO_PUBLIC_MINI_API_TOKEN ?? "";
```

`GEMINI_API_KEY` gets seven lines documenting exactly why shipping it in the
bundle is acceptable and what the escape hatch is if the risk profile
changes. `MINI_API_TOKEN`, two lines later, gets one line about optionality
and nothing about risk — despite being the more dangerous secret: it's a
bearer token with **both** read and write access, confirmed at its two call
sites:

- Read: `lib/mini-sync.ts:84-99` (`fetchMiniTransactions`) — `GET
  /transactions` returns the user's full parsed SMS/transaction history.
- Write: `lib/mini-sync.ts:281-310` (`pushTransactionToMini`) — `POST
  /transactions`, called from `hooks/use-transactions.ts:405-424`:

  ```ts
  if (
    isManualEntry &&
    isPushableType &&
    env.MINI_API_URL &&
    env.MINI_API_TOKEN &&
    variables.merchant
  ) {
    void pushTransactionToMini({
      type: variables.type as "income" | "expense",
      amount: variables.amount,
      merchant: variables.merchant,
      date: variables.date,
      rawText: variables.note ?? variables.merchant,
      senderId: "manual",
    })
      .then(() => logEvent(FIREBASE_EVENTS.MINI_PUSH_SUCCEEDED))
      .catch(() => logEvent(FIREBASE_EVENTS.MINI_PUSH_FAILED));
  }
  ```

Both `MINI_API_URL` and `MINI_API_TOKEN` are `EXPO_PUBLIC_*` and therefore
inlined into the JS bundle exactly like `GEMINI_API_KEY` — extractable from
a built IPA/APK. The actual mitigation exists, but only in prose, in
`docs/V3_SPEC.md:3`: *"single-tenant, personal system — same posture as v2:
the mini is canonical, the app is a client, nothing is exposed off the
tailnet."* — i.e. the mini server is only reachable over Tailscale, so a
leaked token is only useful to someone who is also on that tailnet. That
sentence needs to live next to the secret, not just in a spec doc.

### 5. Crashlytics: always-on collection + real name tagged, no opt-out

`app/_layout.tsx:214-224`, the Crashlytics bootstrap effect (separate from
the boot `useEffect` at lines 174-194 that plan 002 addresses):

```ts
useEffect(() => {
  if (!dbReady || __DEV__) return;
  import("@react-native-firebase/crashlytics")
    .then(async (mod) => {
      const crash = mod.default();
      crash.setCrashlyticsCollectionEnabled(true);
      const userName = await getConfig(CONFIG_KEYS.USER_NAME);
      crash.setAttribute("user_name", userName ?? "unknown");
    })
    .catch(() => {});
}, [dbReady]);
```

`grep -rn "CrashlyticsCollectionEnabled" .` (excluding `node_modules`)
returns only this one call site — there is no `CONFIG_KEYS` entry, settings
row, or any other code path that ever calls it with `false`. Collection is
unconditional on every non-dev build, and every crash report is tagged with
the user's real display name (`CONFIG_KEYS.USER_NAME`, entered via
`app/profile.tsx`'s "Name" row) with no equivalent toggle anywhere.

Firebase Crashlytics assigns its own anonymous installation ID for every
crash automatically — `setAttribute("user_name", ...)` adds a
human-readable label on top of that, purely for the developer's own
convenience when reading the Crashlytics console. `lib/firebase/index.ts`
confirms `crash.recordError` (used by `logFirebaseError`, called from many
places including `lib/db/subscriptions.ts:286`) works the same whether or
not `user_name` is set.

### 6. CSV export: no formula-injection guard

`lib/export/csv.ts:8`:

```ts
const csvEscape = (val: string) => `"${val.replace(/"/g, '""')}"`;
```

This escapes embedded double quotes (CSV syntax) but does nothing about
values whose first character is `=`, `+`, `-`, or `@` — Excel and Google
Sheets evaluate a cell as a formula based on that leading character in the
*decoded* value, independent of the surrounding CSV quoting (the classic
OWASP "CSV injection" class of bug). `csvEscape` wraps every text column,
including `merchant` (line 18) and `note` (line 37):

```ts
csvEscape(t.merchant ?? ""),   // line 18
...
csvEscape(t.note ?? ""),       // line 37
```

Both are attacker-reachable. `merchant` comes from
`lib/gemini/client.ts:136`: `merchant: z.string().nullable().optional()` —
genuinely free text, extracted from arbitrary SMS/email bodies (the prompt
at line 34 says "ALWAYS extract if any name is present"). By contrast
`category` (line 100, 137) is schema-constrained to an `enum` of the user's
existing category names — Gemini cannot free-text a category, so that field
is not part of this risk. `note` is set directly from the raw pasted
SMS/email text in `hooks/use-add-transaction.ts:242`:
`note: originalText.trim()` — the entire pasted message, verbatim, becomes
the transaction note when a user runs a paste through the AI-parse sheet. A
phishing SMS crafted with a merchant name or body starting with
`=HYPERLINK(...)` (or `=cmd|'/c calc'!A1`-style payloads) would sit
harmlessly in the app's own UI (rendered as plain `<Text>`, no formula
evaluation) but could execute when the user later opens their own CSV
export in Excel/Sheets.

- Repo conventions in play: no `any` types; **never run pnpm commands
  yourself** — tell the operator which command to run and wait; NativeWind
  classes only for any UI touched; TanStack Query for all data fetching
  (none of these steps add data fetching).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|----------------------|
| Typecheck | `pnpm typecheck` | exit 0               |
| Lint      | `pnpm lint`      | exit 0               |
| Full gate | `pnpm quality`   | exit 0               |
| Dead code | `pnpm dead-code` | no new findings (relevant if `maskSensitivePii`'s export surface changes) |

There is no `pnpm test` script in this repo (checked `package.json`) — every
step below verifies by typecheck/lint plus a described manual check; no unit
tests to add or run.

## Scope

**In scope**:
- `app/gmail-sync.tsx` (`EmailLogRow`'s snippet `<Text>` only)
- `lib/clipboard.ts` (export surface for the masking function only — no
  change to the masking regexes themselves)
- `lib/db/subscriptions.ts` (the `SIP_POSTED` `logEvent` call only, inside
  `processSubscriptions` — not the transaction-insert logic itself)
- `lib/env.ts` (comment above `MINI_API_TOKEN` only)
- `app/_layout.tsx` (the Crashlytics `useEffect`, lines 214-224, only)
- `lib/export/csv.ts` (`csvEscape` only)

**Out of scope** (do NOT touch):
- `lib/clipboard.ts`'s masking regexes themselves — they are correct and
  already covered by their own inline comments; only the export boundary
  changes.
- `app/_layout.tsx`'s boot `useEffect` (lines 174-194) and splash-hide
  effect (lines 196-198) — owned by plan 002; read-only for this plan.
- `lib/db/subscriptions.ts`'s transaction-insert / holding-recompute logic,
  `parseBillingDays`, `detectRecurringMerchants` — unrelated to this
  finding.
- `lib/gemini/client.ts` — the `merchant` field being free text is a
  correct design choice (real merchant names are free text); this plan
  neutralizes the *export* risk, not the parsing behavior.
- `hooks/use-transactions.ts` — no code change here; the finding at this
  call site is resolved entirely by documenting the token's threat model at
  its definition in `lib/env.ts` (per this plan's assignment: the two
  `MINI_API_TOKEN` findings are the same underlying gap viewed from two
  call sites, fixed once).
- `lib/mini-sync.ts` — no change; token rotation, request signing, or
  moving the mini behind an authed proxy are real hardening options but are
  not part of this plan (the mitigation is documenting the existing
  tailnet-only posture, not building a new one).
- Adding a Crashlytics settings toggle UI — see Step 5's decision writeup;
  the recommended action for this plan is smaller than a full toggle.

## Git workflow

- Branch: `fix/013-security-data-handling`
- Commit per step (or squash if the operator prefers); style:
  `fix(security): mask email snippet on screen, drop analytics amount, document mini token risk, guard CSV formulas, drop crashlytics PII tag`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Mask the on-screen email snippet, not just the clipboard copy

In `lib/clipboard.ts`, export `maskSensitivePii` directly instead of only
the clipboard-writing wrapper (keep `copyMaskedToClipboard` as-is so its
existing call site in `app/gmail-sync.tsx:433` is unaffected):

```ts
export function maskSensitivePii(text: string): string {
```

In `app/gmail-sync.tsx`, add `maskSensitivePii` to the existing
`lib/clipboard` import (line 17) and wrap the on-screen render at line 444:

```tsx
<Text className="text-[10px] text-foreground" selectable>
  {maskSensitivePii(log.body)}
</Text>
```

`log.body` is typed `string | undefined` on `EmailLog` — this branch is
already gated by `log.body &&` at line 426, so `log.body` is a `string`
here; no `?? ""` needed (matches the existing gate, doesn't introduce a new
null case).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n
"maskSensitivePii" lib/clipboard.ts app/gmail-sync.tsx` → shows the export,
the import, and the new call site (three lines, in addition to the existing
`copyMaskedToClipboard` usage). Manual check (describe in your report, do
not attempt without the operator running the app): open Gmail Sync, force a
failed/skipped email log with a card or account number in the body, confirm
the on-screen snippet now shows `[card]`/`****` etc. instead of the raw
digits, and that Copy still produces the same masked text it did before.

### Step 2: Stop shipping the precise SIP amount to Firebase Analytics

In `lib/db/subscriptions.ts`, remove the `amount` field from the
`SIP_POSTED` event (lines 328-333). `subscription_id` and `holding_id`
already let the developer look up the amount in the local DB if ever
needed for debugging; `kind` (buy/sell/dividend/interest) is the piece of
information actually useful for an aggregate analytics event.

```ts
logEvent(FIREBASE_EVENTS.SIP_POSTED, {
  subscription_id: sub.id,
  holding_id: sub.holding_id,
  kind: sub.investment_kind ?? INVESTMENT_KIND.BUY,
});
```

Do not touch the `db.insert(transactions)` call above it, `safeRecomputeHolding`,
or the sibling `RECURRING_TRANSACTION_POSTED` event three lines below —
both are correct as-is.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n
"amount: sub.amount" lib/db/subscriptions.ts` → no output (was previously
one match, inside the `SIP_POSTED` call only — confirm via `git diff` that
no other `amount: sub.amount` in the file was touched, e.g. the
`db.insert(transactions)` call at line 303 keeps its own `amount: sub.amount`,
that one is the real transaction row and is correct/required).

### Step 3: Guard CSV export against formula injection

In `lib/export/csv.ts`, harden the single shared `csvEscape` helper rather
than patching the two named call sites (`merchant`, `note`) individually —
every text column already funnels through `csvEscape`, so fixing it once
protects the two currently-risky fields *and* any free-text column added
later without anyone having to remember to re-apply a fix at each call
site:

```ts
// Cells whose value starts with =, +, -, or @ are interpreted as formulas
// by Excel / Google Sheets when the CSV is opened, regardless of the
// surrounding CSV quoting (OWASP "CSV Injection"). `merchant` is
// unconstrained free text extracted by Gemini from arbitrary SMS/email
// bodies (lib/gemini/client.ts), and `note` can be the entire raw pasted
// message verbatim (hooks/use-add-transaction.ts:242) — both are
// attacker-reachable if a crafted message ever gets parsed. Prefix a
// defusing single quote so the value round-trips as literal text.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const csvEscape = (val: string) => {
  const safe = FORMULA_TRIGGER.test(val) ? `'${val}` : val;
  return `"${safe.replace(/"/g, '""')}"`;
};
```

Every other call site (`format(parsed, ...)`, `t.type`, `t.category_name`,
`t.source_name`, etc.) is unaffected in practice — none of those values
legitimately start with `=`/`+`/`-`/`@`, and if one ever does, being
prefixed with `'` is the correct, safe behavior for a CSV cell either way.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Manual check
(describe in your report): add a transaction with merchant `=1+1` (or run
`buildCSV` against a fixture row with that merchant, e.g. via a throwaway
script — no test harness exists to wire this into), export to CSV, open the
raw file in a text editor and confirm the merchant cell reads
`"'=1+1"` — the leading `'` survives inside the quotes. Opening the file in
a spreadsheet app should show the literal text `=1+1` in that cell, not the
number `2`.

### Step 4: Document the `MINI_API_TOKEN` threat model in `lib/env.ts`

Add a comment above `MINI_API_TOKEN` matching the `GEMINI_API_KEY` comment's
style and rigor (same file, four lines up) — this single comment resolves
both the `hooks/use-transactions.ts` call-site finding and the `lib/env.ts`
definition-site finding, since the gap is the same missing documentation
viewed from two places:

```ts
// Mini sync (personal Mac mini pipeline). Optional — if either value is
// empty, the feature is treated as not configured and degrades to a no-op.
// MINI_API_TOKEN ships in the client bundle exactly like GEMINI_API_KEY
// above (EXPO_PUBLIC_* is inlined into the JS, extractable from a built
// IPA/APK) — and it is the more dangerous of the two secrets: it grants
// both read access (GET /transactions returns the full parsed SMS /
// transaction history, lib/mini-sync.ts's fetchMiniTransactions) and write
// access (POST /transactions can push fabricated rows, pushTransactionToMini)
// to the user's personal sync pipeline, not just a rate-limited AI call.
// Acceptable ONLY because the mini server is tailnet-only — "the mini is
// canonical, the app is a client, nothing is exposed off the tailnet"
// (docs/V3_SPEC.md) — a leaked token is unusable to anyone not already on
// that Tailscale network. If the mini is ever exposed off-tailnet, this
// token needs real scoping (short-lived, rotatable) before that happens.
const MINI_API_URL = process.env.EXPO_PUBLIC_MINI_API_URL ?? "";
const MINI_API_TOKEN = process.env.EXPO_PUBLIC_MINI_API_TOKEN ?? "";
```

No code changes — comment only. Do not touch `GEMINI_API_KEY`'s existing
comment, `warnIfMissing`, or the exported `env` object shape.

**Verify**: `pnpm typecheck` → exit 0 (comment-only change, should be a
no-op, but confirms nothing else drifted); `pnpm lint` → exit 0 (Biome
formats comments too — let it reformat if it wants to rewrap lines).

### Step 5 (decision point): Crashlytics always-on collection + real-name tagging

This one is a product/privacy call, not a pure mechanical fix — presented
as a decision with a recommendation, per this plan's assignment.

**The two options**:
- **(A) Add a settings toggle.** Mirror the existing "App Lock" pattern
  exactly (`app/profile.tsx:180-198`, `hooks/use-app-lock.ts:91-116`'s
  `useAppLockSetting`): a new `CONFIG_KEYS.CRASH_REPORTING_ENABLED`, a
  `useCrashReportingSetting()` hook, and a `Switch` row under Profile →
  Security. `app/_layout.tsx`'s effect reads the config before calling
  `setCrashlyticsCollectionEnabled`.
- **(B) Keep collection always-on as a documented, deliberate tradeoff; fix
  only the concrete PII leak.** Add a code comment explaining the tradeoff
  (parallel to how `lib/env.ts` documents the Gemini key tradeoff) and drop
  the `user_name` attribute — Crashlytics already assigns its own anonymous
  per-install ID for grouping crashes; `setAttribute("user_name", ...)` adds
  nothing but a human-readable label for the developer's own convenience,
  and removing it costs zero functionality.

**Recommendation: (B).** This is architecturally a single-developer,
personal-use app (`docs/V3_SPEC.md`: "single-tenant, personal system";
`CLAUDE.md`: "personal expense tracking app"), and Crashlytics reports go
to the developer's own Firebase project — nobody but the app's author sees
them. A full opt-out toggle is real UI surface (settings row, hook, config
key, docs) to protect against a threat model (the developer seeing their
own name in their own crash dashboard) that doesn't really exist here. The
`certificate pinning` call made for this same app in an earlier audit round
used the identical reasoning: not worth the operational cost for a personal
finance app with this threat model. But the concrete PII exposure — a real
name attached to every crash payload sent to Google's infrastructure — costs
nothing to remove and should be removed regardless of which way the bigger
toggle question goes.

If the operator prefers (A) instead, treat this step as superseded — do not
implement both A and B's code changes; ask before proceeding if there is
any ambiguity about which the operator wants.

Implementing (B), in `app/_layout.tsx:214-224`:

```ts
useEffect(() => {
  if (!dbReady || __DEV__) return;
  import("@react-native-firebase/crashlytics")
    .then((mod) => {
      // Deliberate tradeoff: collection is always-on with no in-app
      // opt-out. This is a single-developer personal app (see
      // docs/V3_SPEC.md) — crash reports go only to the developer's own
      // Firebase project, not a third party with other users' data mixed
      // in. Revisit with a real settings toggle if this app ever gets a
      // wider (non-personal) release.
      mod.default().setCrashlyticsCollectionEnabled(true);
    })
    .catch(() => {});
}, [dbReady]);
```

Removed entirely: the `getConfig(CONFIG_KEYS.USER_NAME)` call and
`crash.setAttribute("user_name", ...)` line. Do not remove the `import(...)`
dynamic import pattern, the `!dbReady || __DEV__` guard, or the outer
`.catch(() => {})`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0; `grep -n
"setAttribute\|user_name" app/_layout.tsx` → no output. `grep -rn
"CrashlyticsCollectionEnabled" .` (excluding `node_modules`) → still exactly
one match, now with the tradeoff comment above it.

## Test plan

No automated tests cover any of these six call sites (no `pnpm test`
script exists in this repo). Verification is typecheck/lint plus the
manual/describe-only checks called out per step above. Step 3's formula
guard is the one worth a throwaway local script if the executor wants extra
confidence before the manual spreadsheet check:

```ts
// scratch, not committed
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
console.log(FORMULA_TRIGGER.test("=1+1"));   // true
console.log(FORMULA_TRIGGER.test("Swiggy")); // false
```

## Done criteria

- [ ] `app/gmail-sync.tsx`'s email-snippet `<Text>` renders
      `maskSensitivePii(log.body)`, not raw `log.body`
- [ ] `lib/clipboard.ts` exports `maskSensitivePii`
- [ ] `lib/db/subscriptions.ts`'s `SIP_POSTED` event no longer includes
      `amount`
- [ ] `lib/export/csv.ts`'s `csvEscape` neutralizes leading
      `=`/`+`/`-`/`@`/tab/CR
- [ ] `lib/env.ts`'s `MINI_API_TOKEN` has a threat-model comment matching
      `GEMINI_API_KEY`'s rigor, citing the tailnet-only mitigation
- [ ] `app/_layout.tsx`'s Crashlytics effect no longer tags `user_name`
      (or, if the operator chose option A instead, a settings toggle exists
      and is wired to `setCrashlyticsCollectionEnabled`)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm quality`, `pnpm dead-code` all
      exit 0 / report no new findings
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 002 has landed and `app/_layout.tsx`'s Crashlytics effect is no
  longer at lines 214-224, or its body differs materially from the excerpt
  in "Current state" (re-locate by searching for
  `setCrashlyticsCollectionEnabled` before editing).
- The operator has not confirmed option (A) vs (B) for Step 5 and the
  ambiguity isn't resolvable from context — do not guess; this is the one
  genuinely product-facing decision in this plan.
- `EmailLog.body`'s type changes from `string | undefined` in a way that
  makes the existing `log.body &&` gate at `app/gmail-sync.tsx:426` no
  longer guarantee a `string` at the render site — re-check before removing
  any null-handling.

## Maintenance notes

- The `csvEscape` fix in Step 3 is defense-in-depth applied at the export
  boundary — it does not change what Gemini extracts or what gets stored.
  Any future export path (JSON export, a hypothetical PDF/report export)
  that writes user-controlled text into a format another program might
  interpret should get the same review, not just CSV.
- If the mini pipeline (`lib/mini-sync.ts`) is ever exposed off-tailnet —
  the scenario Step 4's comment explicitly calls out as the trigger — token
  scoping (short-lived tokens, per-device tokens, or moving to a proper
  auth flow) becomes a real requirement, not a documented tradeoff. Revisit
  then, not now.
- Step 5's recommendation (B) is explicitly conditional on this staying a
  single-developer personal app. If distribution ever widens (family
  members with their own devices, a public release), the settings-toggle
  option (A) should be revisited — the reasoning that makes (B) sufficient
  today (developer-only visibility into crash reports) stops holding.

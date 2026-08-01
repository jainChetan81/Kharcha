# Plan 003: Gmail/SMS sync data-integrity hardening

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f5a9dc9..HEAD -- lib/parsers lib/gmail/parsers lib/gmail/sync.ts hooks/use-gmail-sync-ui.ts hooks/use-refresh.ts`
> If `lib/gmail/sync.ts` or any `lib/gmail/parsers/*.ts` file changed since
> planning, re-read the affected file(s) and reconcile line numbers before
> proceeding — this plan touches 15 files and cites exact lines throughout.
> STOP on structural mismatch (a bank module renamed/merged, `ParsedTransaction`
> shape changed, or `PARSER_MAP` keys changed).

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f5a9dc9`, 2026-08-01

## Why this matters

Two independent regex-parsing trees turn raw bank text into a transaction row
with no human confirming any field: `lib/parsers/` (pasted SMS/notification
text, 3 banks: Axis, HDFC, IndusInd) and `lib/gmail/parsers/` (synced Gmail
message bodies, 13 bank/fintech identities). Both exist specifically to avoid
a Gemini round-trip when a fast regex match is confident enough — which means
a false positive (matching a *non-transaction* notice as a completed
transaction) or a wrong date silently corrupts the user's ledger with no
review step.

The SMS tree already has a shared guard (`isNonTransactionNotice` /
`withGuard` in `lib/parsers/utils.ts`) built and applied to Axis and HDFC —
but IndusInd's three SMS parsers were never wrapped with it, so an
unanchored regex like `/Debited for INR ([\d,]+\.?\d*)/i` matches inside a
future-tense "will be debited" e-mandate notice just as happily as inside a
real debit SMS. The Gmail tree has **no equivalent guard module at all** —
only `hdfc.ts` hand-rolls an inline check, and that check has its own bug (a
dead code branch: the broad reject-on-"e-mandate" condition three lines above
already returns `null` for every body containing the word, so the narrower
"but allow past-tense confirmations" exception below it can never execute).
The other 9 Gmail bank modules (Axis, Citi, HSBC, ICICI, IDFC, IndusInd,
Kotak, SBI, Standard Chartered, plus the 3 fintech-card issuers in
`fintech-cards.ts`) have no filtering whatsoever — an "upcoming AutoPay debit"
or "payment due" email that happens to match one of their loose amount
regexes gets recorded as a completed expense.

Separately, 8 of those same Gmail parser files (plus, per this plan's own
re-verification, `indusind.ts` — a 9th file the original audit's grep for
`fallbackNow()` missed because it uses a differently-named local helper) fall
back to the sync's current wall-clock time when their date regex doesn't
match, instead of returning `null`. Since `lib/gmail/sync.ts` only falls back
to the email's own `internalDate` when the parser returns `null`
(`date: outcome.parsed.date ? ... : msgData.internalDate ? ... `), a
wall-clock fallback silently defeats that better fallback — a transaction
synced days or weeks late (e.g. the very first sync, which backfills up to a
month) gets stamped with today's date instead of its real date.

Independently of parsing correctness, `lib/gmail/sync.ts` itself has three
sync-engine bugs: (1) the cursor (`GMAIL_LAST_SYNCED_AT`) advances to "now"
even when every per-sender Gmail list query failed, permanently losing the
un-fetched window on all future syncs; (2) the transactions dedup check is a
plain SELECT-then-INSERT with a real race window (a Gemini network call sits
between the check and the write) and no DB-level unique constraint, unlike
the subscriptions insert 20 lines later which the code explicitly
transaction-wraps "so parallel gmail syncs ... can't both see 'no existing
row' and race to insert duplicates" — the same reasoning, not applied to the
larger table; (3) neither Gmail API fetch checks `response.ok`, so a
401/403/429 error body is silently treated as "zero messages" rather than
surfaced as a failure. Smaller, self-contained items: the note stored on a
synced transaction is built from Gmail's `snippet` field, which the file's
own comment says is "often a promotional banner ... not the transaction
body" — the exact text the code deliberately avoids for parsing is reused for
what the user sees; one parser writes a `source: "IMPS"` field nothing reads;
and the SMS paste sheet only benefits from 3 of the 13 bank identities the
Gmail tree already knows how to parse, so most banks' users always pay the
Gemini network round-trip for a feature explicitly built to avoid it.

## Current state

**SMS tree — the working guard, and the one gap in it**

- `lib/parsers/utils.ts:7-48` — `withGuard` (wraps a `Parser`, returns `null`
  before calling it if `isNonTransactionNotice` matches) and
  `isNonTransactionNotice` itself (OTP/UPI-PIN, statement/due-reminder,
  e-mandate/upcoming-debit *unless* past-tense confirmation wording is also
  present, credit-card bill-payment self-transfers, and foreign-currency
  spends — deferred to the AI path, which is currency-aware).
- `lib/parsers/axis.ts:132` and `lib/parsers/hdfc.ts:19` both end
  `].map(withGuard);` — every SMS parser in those two files is guarded.
- `lib/parsers/indusind.ts:49-53` — the gap:
  ```ts
  export const INDUSIND_PARSERS: Parser[] = [
    indusindUpiDebit,
    indusindUpiCredit,
    indusindImpsCredit,
  ];
  ```
  No `.map(withGuard)`. `indusindUpiDebit`'s regex
  (`lib/parsers/indusind.ts:5`, `/Debited for INR ([\d,]+\.?\d*)/i`) is
  unanchored — it matches inside a future-tense sentence just as well as a
  real debit line.

**Gmail tree — no shared guard exists; only HDFC filters anything**

- `lib/gmail/parsers/utils.ts` (114 lines, read in full) exports
  `decodeHtmlEntities`, `fallbackNow`, `parseIndianDate`/`parseAxisDate`/
  `parseHdfcDate`, `parseAmount`, `DATE_REGEX`, `MERCHANT_REGEX`,
  `tryParsers` — no `isNonTransactionNotice`/`withGuard` equivalent.
- `lib/gmail/parsers/hdfc.ts:63-90` — `hdfcCreditCard`'s inline, bespoke
  guard (the only one in the whole Gmail tree):
  ```ts
  if (
    body.match(
      /(?:e-?mandate|upcoming\s+(?:debit|payment|transaction)|will\s+be\s+(?:debited|charged|auto-?debited)|scheduled\s+(?:for|on)|shall\s+be\s+debited)/i,
    )
  ) {
    return null;
  }
  // "e-mandate" as a noun can appear inside real past-tense confirmations
  // (e.g. "e-mandate payment has been debited"). Only skip if there's no
  // past-tense debit phrasing alongside it.
  if (body.match(/\be-?mandate\b/i)) {
    const isPastTense = body.match(
      /(?:has\s+been|have\s+been|was|were)\s+(?:debited|charged)/i,
    );
    if (!isPastTense) return null;
  }
  ```
  The first regex's `e-?mandate` alternative matches — and returns `null`
  for — every body containing that word, so the second block's past-tense
  exception (lines 85-90) is dead code: it can never run, because any body
  it would apply to already exited at line 80. Confirmed by construction, not
  just by the audit's claim.
- Verified by reading all 10 remaining bank-parser files
  (`axis.ts`, `citi.ts`, `fintech-cards.ts`, `hsbc.ts`, `icici.ts`, `idfc.ts`,
  `indusind.ts`, `kotak.ts`, `sbi.ts`, `sc.ts` — `fintech-cards.ts` alone
  covers 3 of the 13 `PARSER_MAP` keys below) — none contain a
  `will\s*be|e-?mandate|scheduled|upcoming` check or anything equivalent.
  `lib/gmail/parsers/index.ts:36-50`'s `PARSER_MAP` wires all of them
  (13 keys — `axis`, `citi`, `hdfc`, `hsbc`, `icici`, `idfc`, `indusind`,
  `kotak`, `onecard`, `sbi`, `sc`, `slice`, `uni`) into
  `parseEmailWithFallback`, so every one of those keys is exposed to this
  gap.

**Gmail tree — wall-clock date fallback (8 audit-listed files + 1 more found
during re-verification)**

`fallbackNow()` (`lib/gmail/parsers/utils.ts:29-31`, returns
`format(new Date(), DATE_TIME_FORMAT)`) is the fallback in exactly these
files/lines — re-verified by direct grep against the current tree, matches
the audit exactly:

| File | Lines |
|------|-------|
| `sbi.ts` | 30, 53 |
| `citi.ts` | 28 |
| `icici.ts` | 29, 54, 75 |
| `idfc.ts` | 27, 49 |
| `hsbc.ts` | 27 |
| `kotak.ts` | 31, 56, 79 |
| `sc.ts` | 26, 51 |
| `fintech-cards.ts` | 30, 55, 83 |

Contrast `hdfc.ts:105` (`date: dateMatch ? parseHdfcDate(...) : null,`) and
`axis.ts:60` (`date = altDate ? parseAxisDate(altDate[1]) : null;`) — these
two already return `null` and are correct as-is.

**A 9th file the audit's `fallbackNow()` grep missed**: `lib/gmail/parsers/indusind.ts`
does the same wall-clock thing with its own local helper instead of the
shared one:
```ts
const today = () => format(new Date(), DATE_TIME_FORMAT);   // line 5
...
date: today(),                                                // lines 17, 32, 51
let date = today();
if (dateMatch) { ... }                                        // line 66 (indusindImpsCredit)
```
`indusindUpiDebit` and `indusindUpiCredit` (lines 8-20, 23-35) don't even
*attempt* to extract a date from the body — they unconditionally call
`today()`. `indusindGenericDebit` (lines 38-54) is the same. Only
`indusindImpsCredit` (lines 57-79) tries a `dateMatch` first. All four should
report their real state — no date extracted — as `null`, exactly like the
other 8 files.

- `lib/gmail/sync.ts:354-359` — why the `null` fallback matters (the code
  this bug defeats):
  ```ts
  // If the parsed date is null, use the email's internalDate as fallback
  const fallbackDate = outcome.parsed.date
    ? outcome.parsed.date
    : msgData.internalDate
      ? format(new Date(Number(msgData.internalDate)), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd");
  ```
  A wall-clock string from `fallbackNow()`/local `today()` is truthy, so this
  `internalDate` fallback — strictly better than "now" — never runs for any
  of the 9 files above.

**`lib/gmail/sync.ts` — cursor advances past failed fetches**

```ts
// lines 228-256: per-sender listing loop
for (const sender of allEmails) {
  try {
    const query = `from:${sender} after:${formatted}`;
    const listResponse = await fetch(`${GMAIL_API.MESSAGES}?q=${encodeURIComponent(query)}&maxResults=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = (await listResponse.json()) as { messages?: { id: string }[] };
    for (const m of listData.messages ?? []) { ... }
  } catch (err) {
    result.failed++;
    result.emailLogs.push({ id: `query-${sender}`, from: sender, subject: "", parsedBy: "failed", status: EMAIL_LOG_STATUS.FAILED, errorMessage: String(err).slice(0, 200) });
  }
}

// lines 258-264
if (messages.length === 0) {
  await updateConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT, new Date().toISOString());
  return result;
}
...
// lines 456-459, unconditional at the very end of the function too
await updateConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT, new Date().toISOString());
return result;
```
If every sender's list query throws (offline, expired token, Gmail API
outage), `messages` stays empty, `result.failed` is nonzero, but the cursor
is still stamped to "now" at line 261 — the entire un-fetched window is gone
on every future sync. `hooks/use-gmail-sync-ui.ts:177` confirms nothing
surfaces this to the user: `handleSync` calls `showSuccessToast("Sync
completed")` unconditionally, never inspecting `response.result.failed`.
`hooks/use-refresh.ts`'s `useSyncRefresh` (pull-to-refresh path, lines 52-70)
is the same — it only toasts on `result.added > 0` or a thrown error, never
on `result.failed > 0`.

**`lib/gmail/sync.ts` — unguarded dedup check-then-insert**

```ts
// lines 286-302 (dedup check, right after the message body is decoded)
const existing = await db
  .select({ id: transactions.id })
  .from(transactions)
  .where(eq(transactions.gmail_message_id, message.id))
  .limit(1);

if (existing.length > 0) {
  result.skipped++;
  result.emailLogs.push({ id: message.id, from, subject, parsedBy: PARSED_BY.REGEX, status: EMAIL_LOG_STATUS.DUPLICATE });
  continue;
}
...
// an `await parseEmailWithFallback(...)` network round-trip happens here (line 307) —
// this is the race window: another concurrent sync can pass ITS check while
// this one is awaiting Gemini
...
// lines 361-376
await db.insert(transactions).values({
  amount: outcome.parsed.amount,
  merchant: outcome.parsed.merchant,
  category_id: matchedCategoryId,
  source_id: null,
  gmail_message_id: message.id,
  parsed_by: outcome.parsedBy === PARSED_BY.GEMINI ? PARSED_BY.GEMINI : PARSED_BY.REGEX,
  date: fallbackDate,
  note,
  type: outcome.parsed.type,
  source_type: "synced",
});
```
Twenty lines later, the subscriptions insert in the *same function* is
explicitly wrapped for this exact scenario (`lib/gmail/sync.ts:392-417`):
```ts
// Wrap SELECT + INSERT in a transaction so parallel gmail syncs
// (manual trigger + background sync) can't both see "no existing
// row" and race to insert duplicate subscription entries.
await expo.withTransactionAsync(async () => {
  const existingSub = await db.select(...).from(subscriptions)...
  if (existingSub.length === 0) { await db.insert(subscriptions).values({...}); }
});
```
`lib/db/schema.ts:105` / `lib/db/index.ts:389` confirm there's no DB-level
backstop either — `gmail_message_id` has a plain, non-unique index
(`CREATE INDEX IF NOT EXISTS idx_transactions_gmail_message_id ...`), not a
unique constraint. `hooks/use-refresh.ts`'s `useSyncRefresh` (pull-to-refresh)
and `hooks/use-gmail-sync.ts`'s `useGmailSync` (manual button, via
`app/gmail-sync.tsx`) both call `syncGmailTransactions()` with no shared
mutex — the exact concurrent-sync scenario the subscriptions comment
describes is reachable for transactions too.

**`lib/gmail/sync.ts` — no HTTP `.ok` checks**

```ts
// lines 231-239 (per-sender list)
const listResponse = await fetch(`${GMAIL_API.MESSAGES}?q=...`, { headers: {...} });
const listData = (await listResponse.json()) as { messages?: { id: string }[] };
// no listResponse.ok check

// lines 270-276 (per-message fetch)
const msgResponse = await fetch(`${GMAIL_API.MESSAGES}/${message.id}?format=full`, { headers: {...} });
const msgData = await msgResponse.json();
// no msgResponse.ok check either
```
Both calls already sit inside a `try { } catch (err) { result.failed++; ... }`
block (lines 229-255 and 269-453 respectively) — an expired/rate-limited
token produces an error JSON body with no `messages`/`payload` field, which
today is silently treated the same as a legitimately empty result instead of
throwing into the catch that's already there to handle exactly this.

**`lib/gmail/sync.ts` — note built from `snippet`, not the parsed body**

```ts
// lines 121-123 — the file's own comment, explaining why `body` (not
// `snippet`) is what gets fed to the parser:
// Gmail's `snippet` previews the first visible text, which for bank emails is
// often a promotional banner (e.g. Visa FIFA ad in HDFC mails) — not the
// transaction body. Pull text/plain when present, fall back to stripped HTML.

// lines 344-347 — but the stored note uses snippet anyway:
const trimmedSnippet = snippet.trim();
const note = trimmedSnippet
  ? trimmedSnippet.slice(0, MAX_NOTE_CHARS)
  : GMAIL_SYNC_NOTE;
// line 372, the comment at the insert call site:
// store the original email snippet so the user can see exactly what was parsed
```
`body` (the actual text passed to `parseEmailWithFallback` at line 307-311)
is the thing "exactly what was parsed" should refer to; `snippet` is the
thing the file's own top-of-function comment says not to trust.

**`lib/parsers/index.ts` — SMS fast path covers 3 banks, Gmail tree covers 13**

```ts
// lib/parsers/index.ts:1-6
import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
import type { ParsedTransaction } from "./types";

const ALL_PARSERS = [...AXIS_PARSERS, ...HDFC_PARSERS, ...INDUSIND_PARSERS];
```
vs. `lib/gmail/parsers/index.ts:36-50`'s 13-key `PARSER_MAP`. Only
`components/parse-message-sheet.tsx` calls `parseMessage`
(`components/parse-message-sheet.tsx:14,56`) — it's the only consumer, so
widening its fallback behavior is low blast-radius. `lib/parsers/types.ts`'s
`ParsedTransaction.date` is `string` (never `null`) — the SMS tree's type
has no concept of "no date extracted," unlike the Gmail tree's
`string | null` — this matters for Step 8 below.

**`lib/gmail/parsers/indusind.ts:57-79` — dead `source: "IMPS"` field**

```ts
export const indusindImpsCredit: Parser = (body) => {
  ...
  return {
    amount: parseAmount(amountMatch[1]),
    merchant: fromMatch ? fromMatch[1].trim() : "IMPS Credit",
    date,
    type: TRANSACTION_TYPE.INCOME,
    source: "IMPS",                                          // ← line 77
  };
};
```
`ParsedTransaction` (`lib/gmail/parsers/utils.ts:4-13`) has no `source`
field. Confirmed no reader anywhere: `grep -rn "\.source\b" lib/gmail/`
returns nothing outside this one write site.

- Repo conventions that apply throughout: no `any`; functional components
  only (n/a here, no components change); TanStack Query for data fetching
  (n/a, no UI change beyond the toast wording noted above, which stays
  out of scope — see below); **never run pnpm commands yourself — tell the
  operator which command to run and wait for the result.**

## Commands you will need

| Purpose    | Command           | Expected on success |
|------------|-------------------|----------------------|
| Typecheck  | `pnpm typecheck`  | exit 0               |
| Lint       | `pnpm lint`       | exit 0               |
| Dead code  | `pnpm dead-code`  | no new unused-export findings (in particular: `fallbackNow` should disappear from the knip report once Step 4 removes its last caller, not appear as newly-dead) |
| Full gate  | `pnpm quality`    | exit 0               |

There is no automated test runner in this repo (`pnpm test` does not exist —
confirmed via `package.json`'s `scripts` block). Verification here is
typecheck/lint/knip per step, plus targeted manual smoke tests (paste a
sample SMS/notification text through the app's "Parse Message" sheet; ask
the operator to run a real Gmail sync) called out explicitly where they
matter.

## Scope

**In scope**:
- `lib/parsers/indusind.ts` (apply existing guard)
- `lib/gmail/parsers/utils.ts` (add shared guard)
- `lib/gmail/parsers/hdfc.ts`, `axis.ts`, `citi.ts`, `fintech-cards.ts`,
  `hsbc.ts`, `icici.ts`, `idfc.ts`, `indusind.ts`, `kotak.ts`, `sbi.ts`,
  `sc.ts` (apply shared guard; fix date fallback; remove dead `source` field
  where applicable)
- `lib/gmail/parsers/index.ts` (add an aggregate export for Step 9)
- `lib/gmail/sync.ts` (cursor advance, dedup race, `.ok` checks, note field)
- `lib/parsers/index.ts` (extend fast path to reuse Gmail regex parsers)

**Out of scope** (do NOT touch):
- `lib/gemini/client.ts` and any Gemini prompt/response handling — this plan
  only touches the regex fast paths and the sync engine around them.
- `components/parse-message-sheet.tsx`, `components/sync-results-sheet.tsx` —
  read for context only; their props/behavior should not need to change
  (Step 9's fallback is transparent to the sheet; if it isn't, STOP and
  report rather than editing the component).
- `hooks/use-gmail-sync-ui.ts`'s unconditional "Sync completed" toast and
  `hooks/use-refresh.ts`'s silent-on-`failed` behavior — flagged above as
  supporting evidence for the cursor bug, but the actual fix (Step 5) is
  entirely inside `syncGmailTransactions`; surfacing partial failure in the
  UI more prominently is a separate, UI-facing follow-up, not bundled here.
- Adding a DB-level `UNIQUE` constraint on `gmail_message_id` — a stronger
  backstop than Step 6's transaction wrap, but it requires a migration that
  first de-duplicates any rows that may already exist from the current race,
  which is real schema-migration risk not justified for a MED-risk plan.
  Note it in your report as a candidate follow-up; do not attempt it here.
- `lib/db/schema.ts` / `drizzle/` migrations — no schema change in this plan.
- Porting every Gmail bank's regex into a byte-identical second copy under
  `lib/parsers/` — Step 9 reuses the Gmail parsers directly instead (see
  that step) specifically to avoid recreating the drift problem a prior,
  now-deleted plan (`009-parser-drift-control.md`) was written to solve.

## Git workflow

- Branch: `fix/003-gmail-sms-sync-data-integrity`
- Commit per step; style: `fix(sms-parsers): apply shared non-transaction guard to indusind`, `feat(gmail-parsers): shared non-transaction guard module`, `fix(gmail-parsers): apply shared guard to all bank modules`, `fix(gmail-parsers): return null instead of wall-clock time on date-parse miss`, `fix(gmail-sync): don't advance cursor when sender queries failed`, `fix(gmail-sync): close dedup race with a transaction-wrapped recheck`, `fix(gmail-sync): check response.ok on Gmail API fetches`, `fix(gmail-sync): build the synced-transaction note from the parsed body, not the snippet`, `feat(sms-parsers): reuse gmail regex parsers as a second local fast-path tier`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Apply the existing SMS guard to IndusInd

The fix already exists — `lib/parsers/utils.ts`'s `withGuard` — IndusInd's
three parsers just never got wrapped with it, unlike its siblings.

In `lib/parsers/indusind.ts`, add `withGuard` to the existing import from
`./utils` (currently `import { parseAmount, parseAxisDate, today } from
"./utils";`) and change the export at the bottom (lines 49-53) to match
`axis.ts:124-132` / `hdfc.ts:19`'s pattern:

```ts
export const INDUSIND_PARSERS: Parser[] = [
  indusindUpiDebit,
  indusindUpiCredit,
  indusindImpsCredit,
].map(withGuard);
```

**Verify**: `pnpm typecheck` → exit 0. Manually paste a future-tense IndusInd
sample through the app's "Parse Message" sheet (e.g. `"Your account will be
debited for INR 499 towards Netflix on 05-04-26"`) and confirm it now falls
through to Gemini instead of being accepted by the regex fast path (it should
no longer show up as an instant, no-spinner result).

### Step 2: Build the shared non-transaction guard for the Gmail tree

Add to `lib/gmail/parsers/utils.ts` a guard mirroring `lib/parsers/utils.ts`'s
`isNonTransactionNotice`/`withGuard`, adapted to the `Parser`/`ParsedTransaction`
types already defined in this file. Use the SMS-side version as the reference
implementation for the e-mandate logic specifically — it already gets the
"reject unless past-tense confirmation" rule right in one combined condition,
which is the exact bug `hdfc.ts` has (see Current State above: its two
sequential `if` blocks make the second one unreachable):

```ts
/** Wrap a parser so non-transaction notices are never matched. */
export function withGuard(parser: Parser): Parser {
  return (body) => (isNonTransactionNotice(body) ? null : parser(body));
}

/**
 * True for emails that must never be parsed as completed transactions by
 * the regex fast path. Mirrors lib/parsers/utils.ts's SMS-side guard:
 * OTPs, statements, payment-due reminders, upcoming AutoPay / e-mandate
 * pre-debit notices (unless past-tense confirmation wording is also
 * present), credit-card bill-payment confirmations (self-transfers, not
 * income), and foreign-currency spends (deferred to Gemini, which is
 * currency-aware).
 */
export function isNonTransactionNotice(body: string): boolean {
  if (/\bOTP\b|\bUPI\s+PIN\b|has\s+been\s+declined/i.test(body)) return true;
  if (
    /statement\s+(?:generated|for\s+your)|total\s+due|min\.?\s*due|amount\s+due|is\s+(?:over)?due|reminder!/i.test(
      body,
    )
  )
    return true;
  if (
    /(?:e-?mandate|upcoming\s+(?:mandate|debit|payment|transaction|AutoPay)|will\s+be\s+(?:debited|charged|auto-?debited)|to\s+be\s+debited\s+by|scheduled\s+(?:for|on)|shall\s+be\s+debited|auto\s*pay\s*activation)/i.test(
      body,
    ) &&
    !/(?:has\s+been|have\s+been|was|were)\s+(?:debited|charged)/i.test(body)
  ) {
    return true;
  }
  if (
    /payment\s+of\s+(?:INR|Rs\.?)\s+[\d,.]+\s+has\s+been\s+received\s+towards\s+your\s+.*credit\s+card/i.test(
      body,
    )
  ) {
    return true;
  }
  if (/\b(?:USD|EUR|GBP|AED|SGD|AUD|CAD)\s*[\d,]+(?:\.\d+)?/.test(body))
    return true;
  return false;
}
```

Do not wire it into any bank module yet — that's Step 3. This step only adds
the module and its exports.

**Verify**: `pnpm typecheck` → exit 0. `grep -n "isNonTransactionNotice\|withGuard" lib/gmail/parsers/utils.ts` → both present.

### Step 3: Apply the shared Gmail guard to every bank module, replacing HDFC's bespoke one

For the 10 files listed under "no guard at all" in Current State (`axis.ts`,
`citi.ts`, `fintech-cards.ts`, `hsbc.ts`, `icici.ts`, `idfc.ts`, `indusind.ts`,
`kotak.ts`, `sbi.ts`, `sc.ts`), add `withGuard` to each file's import from
`./utils` and wrap each `export const X_PARSERS: Parser[] = [...]` with
`.map(withGuard)`, matching the SMS-side pattern from Step 1. **9 of these
10 files export exactly one such array — `fintech-cards.ts` is the
exception and exports three** (`SLICE_PARSERS`, `ONECARD_PARSERS`,
`UNI_PARSERS`, one per card issuer). Wrap all three with their own
`.map(withGuard)` in that file — don't wrap only the first one you find
while pattern-matching off the other 9 single-array files.

For `hdfc.ts` specifically: add `withGuard` to its own import from `./utils`
too (currently `{ MERCHANT_REGEX, type Parser, parseAmount, parseHdfcDate }`,
no `withGuard` — this file needs the same import addition as the other 10,
it's just not repeated from the paragraph above since this file's body edit
differs). Delete the bespoke inline block (lines 66-90,
the two `if` blocks quoted in Current State — both the unconditional
e-mandate reject and the now-provably-dead past-tense exception under it),
and instead wrap `HDFC_PARSERS` itself with `.map(withGuard)`:

```ts
export const HDFC_PARSERS: Parser[] = [
  hdfcUpiCreditCard,
  hdfcCreditCard,
  hdfcDebit,
  hdfcCredit,
].map(withGuard);
```

This resolves the dead-code finding by construction — the shared guard's
single combined condition (built in Step 2) replaces both of HDFC's
sequential checks with the one that's actually correct. `hdfcCreditCard`
keeps its own `HDFC`/`credit card` gates (lines 64-65) since those are
bank/product identification, not non-transaction filtering — leave them.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.
`grep -L "withGuard" lib/gmail/parsers/{axis,citi,fintech-cards,hdfc,hsbc,icici,idfc,indusind,kotak,sbi,sc}.ts`
→ empty output (every file now references `withGuard`).
Manually paste a sample "upcoming e-mandate" or "payment due" email body
(any bank) through a Gmail-sync dry run or the parse sheet and confirm it no
longer regex-matches as a completed transaction.

### Step 4: Fix the wall-clock date fallback in all 9 affected files

Mechanical, one-line-per-callsite change: replace `fallbackNow()` with
`null` at every line listed in the Current State table (`sbi.ts:30,53`,
`citi.ts:28`, `icici.ts:29,54,75`, `idfc.ts:27,49`, `hsbc.ts:27`,
`kotak.ts:31,56,79`, `sc.ts:26,51`, `fintech-cards.ts:30,55,83`) — i.e.
`date: dateMatch ? parseIndianDate(dateMatch[1]) : fallbackNow(),` becomes
`date: dateMatch ? parseIndianDate(dateMatch[1]) : null,`. Remove
`fallbackNow` from each file's now-unused import from `./utils`. After the
last caller is gone, remove the `fallbackNow` function itself from
`lib/gmail/parsers/utils.ts` (lines 28-31) — nothing else in the repo calls
it (`grep -rn "fallbackNow" --include="*.ts" .` confirms these 8 files are
the only callers), and leaving it would show up as a new dead export in
`pnpm dead-code`.

`indusind.ts` needs a slightly different, non-mechanical edit since it never
imported `fallbackNow` — it has its own local wall-clock helper. The file's
first two lines are:
```ts
import { format } from "date-fns";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
```
**Do not delete "lines 1-2" wholesale** — line 2 also imports
`TRANSACTION_TYPE`, which every parser in this file uses
(`TRANSACTION_TYPE.EXPENSE`/`.INCOME`) and is unrelated to the date-fallback
fix; deleting it breaks the build. Remove the local `today` function
(`lib/gmail/parsers/indusind.ts:5`) and only these two things: the entire
`import { format } from "date-fns";` line (line 1), and just the
`DATE_TIME_FORMAT` specifier from line 2 (leaving
`import { TRANSACTION_TYPE } from "@/lib/constants";`). Then:
- `indusindUpiDebit` (line 17), `indusindUpiCredit` (line 32),
  `indusindGenericDebit` (line 51): change `date: today(),` to `date: null,`
  — none of these three ever extract a date, so `null` is the honest value.
- `indusindImpsCredit` (lines 66-70): change
  ```ts
  let date = today();
  if (dateMatch) {
    const [day, month, year] = dateMatch[1].split("-");
    date = `20${year}-${month}-${day} 00:00`;
  }
  ```
  to
  ```ts
  let date: string | null = null;
  if (dateMatch) {
    const [day, month, year] = dateMatch[1].split("-");
    date = `20${year}-${month}-${day} 00:00`;
  }
  ```
  While in this file for the date fix, also remove the dead `source: "IMPS"`
  field from `indusindImpsCredit`'s return (line 77) — `ParsedTransaction`
  has no `source` field and nothing reads it (confirmed in Current State).

**Verify**: `pnpm typecheck` → exit 0 (confirms every touched return still
satisfies `ParsedTransaction`'s `date: string | null`).
`grep -rn "fallbackNow\|const today" lib/gmail/parsers/` → no matches.
`pnpm lint` → exit 0. `pnpm dead-code` → `fallbackNow` does not appear as a
newly-unused export (it was removed, not left dangling).

### Step 5: Don't advance the sync cursor when sender queries failed

In `lib/gmail/sync.ts`, track whether any per-sender list query failed, and
gate both `updateConfig(CONFIG_KEYS.GMAIL_LAST_SYNCED_AT, ...)` calls on it.
Add a flag before the per-sender loop (near `const messages: { id: string }[]
= [];`, line 227):

```ts
let listQueryFailed = false;
```

In the `catch` block of that loop (currently lines 245-255), add
`listQueryFailed = true;` alongside the existing `result.failed++`.

Change the early-return block (lines 258-264):

```ts
if (messages.length === 0) {
  if (!listQueryFailed) {
    await updateConfig(
      CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
      new Date().toISOString(),
    );
  }
  return result;
}
```

And the end-of-function call (lines 456-459):

```ts
if (!listQueryFailed) {
  await updateConfig(
    CONFIG_KEYS.GMAIL_LAST_SYNCED_AT,
    new Date().toISOString(),
  );
}
return result;
```

Deliberately scoped to the *listing* failures only (not per-message
processing failures later in the function) — a message whose body-fetch or
insert fails is still a known message ID; re-listing it next sync just costs
an extra Gmail API call, since dedup will skip it once it does succeed. A
sender whose list query never ran is a window of messages the app doesn't
even know exist — that's the unrecoverable case this step targets.

**Verify**: `pnpm typecheck` → exit 0. `grep -n "listQueryFailed" lib/gmail/sync.ts` → appears at declaration, the catch block, and both `updateConfig` guards (4 occurrences). Ask the operator to verify manually: with Gmail temporarily disconnected/airplane mode, trigger a sync, confirm it fails gracefully; then reconnect and sync again — confirm the sync-from date shown in the Gmail Sync screen did not silently jump forward during the failed attempt.

### Step 6: Close the transactions dedup race with a transaction-wrapped recheck

Keep the existing early dedup check (lines 286-302) as-is — it's a valid
fast-path optimization that avoids a wasted Gemini call for messages already
known to be synced. The actual race is the gap between that check and the
`insert` roughly 60 lines later, across an `await
parseEmailWithFallback(...)` network call. Close it the same way the
subscriptions block already does: re-check immediately before the write,
with both statements inside one `expo.withTransactionAsync`.

Replace the insert block (currently lines 361-376). **Note the comment on
the line right before `note,`** — it's easy to drop by accident in a
find/replace and Step 8 (below) still needs it there to update later:

```ts
await db.insert(transactions).values({
  amount: outcome.parsed.amount,
  merchant: outcome.parsed.merchant,
  category_id: matchedCategoryId,
  source_id: null,
  gmail_message_id: message.id,
  parsed_by:
    outcome.parsedBy === PARSED_BY.GEMINI
      ? PARSED_BY.GEMINI
      : PARSED_BY.REGEX,
  date: fallbackDate,
  // store the original email snippet so the user can see exactly what was parsed
  note,
  type: outcome.parsed.type,
  source_type: "synced",
});
```

with:

```ts
// Re-check for a concurrent insert immediately before writing — the early
// check above can't close this race because a Gemini network call (this
// message's `parseEmailWithFallback` above) sits between it and here, long
// enough for a second, parallel sync (manual trigger + background sync) to
// pass its own early check and insert first. Mirrors the subscriptions
// guard below.
let raceDuplicate = false;
await expo.withTransactionAsync(async () => {
  const stillMissing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.gmail_message_id, message.id))
    .limit(1);
  if (stillMissing.length > 0) {
    raceDuplicate = true;
    return;
  }
  await db.insert(transactions).values({
    amount: outcome.parsed.amount,
    merchant: outcome.parsed.merchant,
    category_id: matchedCategoryId,
    source_id: null,
    gmail_message_id: message.id,
    parsed_by:
      outcome.parsedBy === PARSED_BY.GEMINI
        ? PARSED_BY.GEMINI
        : PARSED_BY.REGEX,
    date: fallbackDate,
    // store the original email snippet so the user can see exactly what was parsed
    note,
    type: outcome.parsed.type,
    source_type: "synced",
  });
});

if (raceDuplicate) {
  result.skipped++;
  result.emailLogs.push({
    id: message.id,
    from,
    subject,
    parsedBy: outcome.parsedBy,
    status: EMAIL_LOG_STATUS.DUPLICATE,
  });
  continue;
}
```

The `result.added++` / success `emailLogs.push` block right after (currently
lines 420-437) stays where it is, now only reached on an actual insert.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Read the function
back and confirm exactly one `db.insert(transactions)` call site remains, and
it's inside `expo.withTransactionAsync`. This race is not mechanically
testable without simulating concurrent syncs — note in your report that this
step is typecheck/lint-verified only; a true concurrency test is out of scope
for a repo with no test harness.

### Step 7: Check `response.ok` on both Gmail API fetches

In `lib/gmail/sync.ts`, after the per-sender list fetch (currently lines
231-236):

```ts
const listResponse = await fetch(
  `${GMAIL_API.MESSAGES}?q=${encodeURIComponent(query)}&maxResults=50`,
  { headers: { Authorization: `Bearer ${accessToken}` } },
);
if (!listResponse.ok) {
  throw new Error(`Gmail list query failed: ${listResponse.status}`);
}
const listData = (await listResponse.json()) as {
  messages?: { id: string }[];
};
```

The `throw` is caught by the existing `catch (err)` block for this loop
(lines 245-255), which already does `result.failed++` and logs an
`emailLogs` entry with `errorMessage` — no new error-handling path needed,
and this also feeds Step 5's `listQueryFailed` flag automatically.

Same pattern after the per-message fetch (currently lines 270-275):

```ts
const msgResponse = await fetch(
  `${GMAIL_API.MESSAGES}/${message.id}?format=full`,
  { headers: { Authorization: `Bearer ${accessToken}` } },
);
if (!msgResponse.ok) {
  throw new Error(`Gmail message fetch failed: ${msgResponse.status}`);
}
const msgData = await msgResponse.json();
```

This throw is caught by the outer per-message `catch (err)` block (lines
438-453), which already increments `result.failed` and logs.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.
`grep -n "\.ok" lib/gmail/sync.ts` → two new occurrences, one per fetch call.

### Step 8: Build the synced-transaction note from the parsed body, not the snippet

In `lib/gmail/sync.ts`, replace the note-building block (currently lines
344-347):

```ts
const trimmedSnippet = snippet.trim();
const note = trimmedSnippet
  ? trimmedSnippet.slice(0, MAX_NOTE_CHARS)
  : GMAIL_SYNC_NOTE;
```

with:

```ts
const trimmedBody = body.trim();
const note = trimmedBody
  ? trimmedBody.slice(0, MAX_NOTE_CHARS)
  : GMAIL_SYNC_NOTE;
```

`body` (line 284: `const body: string = extracted.body || snippet;`) is
already in scope at this point in the function — it's the exact text that
was fed to `parseEmailWithFallback`. Also fix the now-accurate comment at the
insert call site (line 372, currently "store the original email snippet so
the user can see exactly what was parsed") to say body instead of snippet.
Leave the `MAX_NOTE_CHARS` cap and the `snippet` variable itself alone —
`snippet` is still used elsewhere in the function (the `EMPTY_BODY` log
reason check at line 325) and stays.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0. Ask the operator
to run a real Gmail sync and spot-check one synced transaction's note in the
app — it should read like the actual bank message body, not a promotional
snippet.

### Step 9: Reuse the (now-guarded) Gmail regex parsers as a second local fast-path tier for pasted SMS

Rather than hand-porting each of the 10 additional bank identities' regex a
second time into `lib/parsers/` — which would recreate exactly the drift
problem a prior, now-deleted plan (`009-parser-drift-control.md`) existed to
solve — reuse the Gmail tree's parsers directly. They're already
text-in/text-out (`Parser = (body: string) => ParsedTransaction | null`,
structurally identical to the SMS tree's own `Parser` type modulo field
names), and after Steps 2-3 every one of them is wrapped by the shared
non-transaction guard, so it's now safe to run them against arbitrary pasted
text.

This step must land after Steps 2 and 3 (the guard) — running unguarded
Gmail parsers against pasted SMS text would reintroduce finding 59's exact
bug one layer up.

In `lib/gmail/parsers/index.ts`, add an aggregate export next to the
existing `PARSER_MAP` (after line 50):

```ts
/** Every Gmail bank parser, flattened — used by the SMS paste sheet as a
 * second local-regex tier (see lib/parsers/index.ts) since it doesn't know
 * the sender's bank ahead of time the way Gmail sync does via parser_key. */
export const ALL_EMAIL_PARSERS: Parser[] = Object.values(PARSER_MAP).flat();
```

In `lib/parsers/index.ts`, extend `parseMessage`:

```ts
import { ALL_EMAIL_PARSERS } from "@/lib/gmail/parsers";
import { tryParsers as tryEmailParsers } from "@/lib/gmail/parsers/utils";
import { AXIS_PARSERS } from "./axis";
import { HDFC_PARSERS } from "./hdfc";
import { INDUSIND_PARSERS } from "./indusind";
import type { ParsedTransaction } from "./types";
import { today } from "./utils";

const ALL_PARSERS = [...AXIS_PARSERS, ...HDFC_PARSERS, ...INDUSIND_PARSERS];

export function parseMessage(text: string): ParsedTransaction | null {
  for (const parser of ALL_PARSERS) {
    const result = parser(text);
    if (result) return result;
  }

  // Second tier: the Gmail regex parsers cover 13 bank/fintech identities
  // vs. the 3 above, and work unmodified on pasted text now that every one
  // is guarded (see lib/gmail/parsers/utils.ts's isNonTransactionNotice).
  // Best-effort, not full parity — several gate on the bank's full name
  // appearing in the text (e.g. "ICICI"), which a real SMS doesn't always
  // spell out. Gemini remains the final fallback for anything these miss.
  const emailResult = tryEmailParsers(ALL_EMAIL_PARSERS, text);
  if (emailResult) {
    const { type } = emailResult;
    if (type !== "investment") {
      return {
        amount: emailResult.amount,
        merchant: emailResult.merchant,
        date: emailResult.date ?? today(),
        type,
      };
    }
  }

  return null;
}

export type { ParsedTransaction } from "./types";
```

The `type !== "investment"` guard exists purely for type-safety —
`lib/parsers/types.ts`'s `ParsedTransaction.type` is `"expense" | "income"`
only, unlike the Gmail tree's type which also allows `"investment"`; no
current Gmail regex parser actually returns `"investment"` (only the Gemini
path does), but this keeps the function honest without an `as` cast.

**Verify**: `pnpm typecheck` → exit 0 (confirms the type narrowing works
without a cast); `pnpm lint` → exit 0; `pnpm dead-code` → no new findings
(`ALL_EMAIL_PARSERS` has exactly one consumer, so it must not be flagged
unused — if it is, the import in `lib/parsers/index.ts` didn't take).
Manually paste a sample ICICI/SBI/Kotak SMS through the "Parse Message" sheet
and confirm it's now handled by the instant local path instead of always
hitting Gemini. If a bank's Gmail parser gates on the full bank name and a
real SMS from that bank doesn't include it, that specific bank will still
fall through to Gemini — expected and fine, not a regression.

## Test plan

No automated test harness exists in this repo (no `pnpm test` script) — see
Commands table. Coverage is: `pnpm typecheck`/`pnpm lint`/`pnpm dead-code`
per step (mechanical correctness, and the guard/date-fallback logic is
exercised indirectly through TypeScript's exhaustiveness on the
`ParsedTransaction` shape), plus the manual smoke tests named in Steps 1, 3,
5, 8, and 9. If a test runner is ever added to this repo, this plan's ideal
follow-up coverage is: fixture-based unit tests for `isNonTransactionNotice`
(both trees) against real anonymized notice/confirmation samples, and a
fixture per bank asserting `date` is `null` (not a wall-clock string) when
the date regex doesn't match.

## Done criteria

- [ ] `lib/parsers/indusind.ts`'s `INDUSIND_PARSERS` ends `.map(withGuard)`
- [ ] `lib/gmail/parsers/utils.ts` exports `isNonTransactionNotice`/`withGuard`
- [ ] All 13 Gmail bank-parser export arrays across 11 files (`AXIS_PARSERS`
      through `UNI_PARSERS` — `fintech-cards.ts` alone contributes 3:
      `SLICE_PARSERS`, `ONECARD_PARSERS`, `UNI_PARSERS`) are wrapped
      `.map(withGuard)`; `hdfc.ts`'s bespoke inline e-mandate check is gone
- [ ] `fallbackNow()` no longer exists anywhere in the Gmail parser tree
      (function removed, all 17 call sites across 8 files changed to `null`)
- [ ] `lib/gmail/parsers/indusind.ts` has no local `today()` helper; its 4
      parsers return `null` (not a wall-clock string) when no date is
      extracted; its dead `source: "IMPS"` field is gone
- [ ] `lib/gmail/sync.ts`'s cursor `updateConfig` calls are both gated on
      `!listQueryFailed`
- [ ] `lib/gmail/sync.ts` has exactly one `db.insert(transactions)` call
      site, inside `expo.withTransactionAsync` with a recheck
- [ ] Both Gmail API `fetch` calls in `sync.ts` check `.ok` and throw into
      their existing `catch` blocks on failure
- [ ] The synced-transaction `note` is built from `body`, not `snippet`
- [ ] `lib/parsers/index.ts`'s `parseMessage` tries `ALL_EMAIL_PARSERS` as a
      second tier before falling through to `null` (→ Gemini, from the
      caller's perspective)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm dead-code`, `pnpm quality` all
      clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any bank module's regex or field shape has materially changed since this
  plan was written (the drift check at the top catches structural
  renames/merges; also watch for a bank module gaining a new export not
  covered by this plan's guard-wrapping instructions).
- Step 3's guard rejects a body you believe is a real transaction during
  manual testing — false positives here are a real regression (an SMS/email
  the guard should NOT have blocked); report the exact text pattern instead
  of loosening the regex ad hoc.
- `expo.withTransactionAsync` in Step 6 throws when nested/re-entered (it
  shouldn't be — the subscriptions block later in the same function already
  uses one independently — but if SQLite errors on two transactions opened
  in sequence within one `syncGmailTransactions()` call, report the exact
  error rather than removing the wrap).
- Step 9's `ALL_EMAIL_PARSERS` reuse causes `pnpm typecheck` to fail on the
  `type` narrowing (i.e., TypeScript doesn't accept `type` as
  `"expense" | "income"` after the `!== "investment"` guard) — this
  shouldn't happen with the destructured-const pattern shown, but if it
  does, report the exact TS error rather than reaching for `as`.

## Maintenance notes

- The Gmail tree's `isNonTransactionNotice` (Step 2) and the SMS tree's
  (`lib/parsers/utils.ts`) are still two separate copies, by design — same
  situation as the parser regexes themselves, and the same rationale
  applies (see the now-deleted `009-parser-drift-control.md`: full
  unification wasn't worth a workspace restructure). If a future notice
  pattern needs to be added to one, add it to both, or promote this
  plan's approach (Step 9: import instead of copy) one level further and
  have the SMS tree's guard just call the Gmail tree's.
- Any new Gmail bank module added after this plan lands must end its export
  array with `.map(withGuard)` and return `null` (never a wall-clock
  fallback) for `date` on a parse miss — both are now the established
  pattern across all 11 files, not just an exception on two of them.
- `ALL_EMAIL_PARSERS` (Step 9) makes `lib/parsers/index.ts` depend on
  `lib/gmail/parsers/*`. The dependency only goes one direction (checked:
  no file under `lib/gmail/parsers/` imports from `lib/parsers/`) — keep it
  that way; if the Gmail tree ever needs something from the SMS tree, that's
  a sign the shared logic belongs in a genuinely common module instead.
- The DB-level `UNIQUE` constraint on `gmail_message_id` noted as
  out-of-scope above is the natural next hardening step once there's an easy
  way to confirm no duplicate rows currently exist (e.g. after Step 6 has
  been live for a while with zero new duplicates observed).

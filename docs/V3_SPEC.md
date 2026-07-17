# kharcha v3 — ai-first parsing + remote parse api

date: 2026-07-17. status: spec. builds on `docs/V2_MINI_PLAN.md` (steps 1–4 live) and the kharcha-mini runbook. single-tenant, personal system — same posture as v2: the mini is canonical, the app is a client, nothing is exposed off the tailnet.

## problem statement

v2 fixed *capture* (SMS ingestion moved off the phone, always-on, verified live). what's still wrong is *understanding*:

- **regex-first parsing misreads messages the regexes were never written for.** the live audit (running now) has already surfaced the patterns: "upcoming AutoPay" pre-debit notices parsed as real debits (they're announcements, not transactions), USD subscription charges stored as INR numbers (a $12.99 charge lands as ₹12.99), garbled merchant strings ("UPI-AMZN1234-P2M"-style residue), and broad miscategorization (everything mini-synced lands in "Other" because the mini and app category vocabularies never matched).
- **the AI layer is a bolt-on, not the parser.** openrouter proofread only fires when regex fails or emits a placeholder merchant — so a regex that *confidently parses the wrong thing* (the AutoPay case) never gets a second opinion. the inversion is the core of v3: AI parses first, regex validates.
- **the app still carries a dead-weight parsing stack.** on-device gemini parsing is being ripped out; the paste sheet needs somewhere to send text. the mini already has a better parser, an alias table, and months of context — the app should just call it.
- **known app-side debts** block a clean restore story: the export/import WAL bug, the pull path skipping `parsedBy: 'manual'` rows, and single-page pulls.
- **historical data is dirty** in exactly the ways the audit describes, and no repair path exists.

## goals

1. every incoming SMS goes through an AI parse first (openrouter, `google/gemini-3.5-flash`), with regex demoted to validator / fast-path / fallback. AI must reliably: reject non-transactions (OTPs, promos, statements, payment-due reminders, and especially upcoming-AutoPay pre-debit notices), handle foreign currencies (store currency + original amount + INR amount), extract clean merchant names, and categorize into the canonical vocabulary.
2. a `POST /parse` endpoint on the mini so the app's paste sheet (and future notification parsing) delegates parsing over the tailnet. graceful degradation off-tailnet.
3. schema evolution on both sides: currency columns, `investment` type parity, review flags, and a story for how backfilled/manual rows coexist with pipeline rows.
4. pay down the app debts: WAL export bug, manual-row pull skip, pull pagination.
5. a one-time, audit-informed re-parse/repair pass over historical data, with a clean way to propagate corrections to the app.

## non-goals

- multi-tenant / publishing. still parked, still not reconsidered.
- gmail ingestion on the mini (v2 step 5). stays conditional; nothing here depends on it.
- local models. openrouter is fine at this volume (~10–40 SMS/day; fractions of a cent).
- real-time FX rates. a manually-maintained rate table is enough for a personal ledger (see §schema).
- retry queues / offline write buffering in the app beyond what exists. push stays fire-and-forget.

## canonical category vocabulary

one vocabulary, owned by the mini, seeded identically in the app. this replaces both the mini's current `DEFAULT_CATEGORIES` (which has Bills/Groceries) and fixes the v2 known-follow-up that mini categories don't match app seeds.

- **expense:** Food, Transport, Shopping, Utilities, Entertainment, Health, Home, Sports, Work, Other
- **income:** Salary, Refunds, Other
- **investment:** (no sub-categories for now; type itself is the bucket)

the AI response schema enums on exactly this list. `merchant_aliases.category` values get migrated to it (Bills→Utilities, Groceries→Food) as part of phase 1.

## architecture

```
iphone sms ──icloud──> mini chat.db ──launchd poll (15 min)──> ingest pipeline
                                                                    │
              ┌─────────────────────────────────────────────────────┤
              │  1. allowlist (unchanged)                           │
              │  2. deterministic guard  ── OTP/known-junk ──> drop (never hits LLM)
              │  3. regex parse (always runs, cheap, candidate)     │
              │  4. alias lookup on regex merchant                  │
              │  5. fast-path check ── known template + regex agree ──> persist (no LLM)
              │  6. AI parse (openrouter, schema v2) ──── error ──> regex fallback
              │  7. cross-check AI vs regex ── disagree ──> needs_review
              │  8. persist (is_transaction gate, alias writeback)  │
              └─────────────────────────────────────────────────────┘
                                                                    │
                                            canonical sqlite (mini) │
                                                                    │
        api 127.0.0.1:8300 (bearer, tailscale serve, never funnel) ─┤
              GET /transactions · POST /transactions · PATCH /transactions/:id
              POST /parse  (NEW — remote parse for the app)
              GET /sync/status · /digest/today · /health
                                                                    │
        app (expo) ── pull/push sync client ── paste sheet ── POST /parse
              on-device gemini: REMOVED · lib/parsers regex: kept as offline fallback
```

## design

### 1. ai-first pipeline (mini)

pipeline order per message, replacing the current regex-primary + conditional-proofread flow in `src/ingest/`:

1. **allowlist** — unchanged (substring match on bank DLT codes).
2. **deterministic guard** — the existing shared non-transaction detectors (`isAxisNonTransactionNotice`, `isHdfcNonTransactionNotice`) plus a bank-agnostic keyword layer (OTP codes, "will be debited", "is due", "e-mandate", "statement is ready", promo patterns). anything caught here is recorded as `parsed_by: 'skipped'` with a `skip_reason` and **never reaches the LLM**. this is the first cost/safety gate — the v2 panel-review lesson (don't send OTPs to an LLM) carries forward. the guard errs conservative: only patterns with zero historical false-positives; ambiguous messages fall through to AI, which is the layer actually trusted to decide `is_transaction`.
3. **regex parse** — the existing bank parsers always run. free, instant, and their output becomes (a) the fast-path candidate, (b) the cross-check reference, (c) the fallback when openrouter is down. regex no longer decides anything alone.
4. **alias lookup** — exact-match on the normalized regex merchant, as today. a hit doesn't skip the AI on its own (the AutoPay lesson: a confidently-wrong parse is the dangerous case), but the alias's canonical merchant + category are passed into the AI prompt as context and applied on output.
5. **fast-path (cost control)** — skip the LLM only when *all* hold: regex parsed with `confidence: 'high'`, merchant is not a generic placeholder, an alias hit resolved merchant + category, the message matches a **known-good template** (see caching below), and the deterministic guard is certain it's a transaction. persist as `parsed_by: 'regex'`. expected to cover the recurring bulk (Swiggy, Netflix, salary credits) after a few weeks of alias/template accumulation.
6. **AI parse** — openrouter call with response schema v2 (below). model pinned via config key `openrouter_model` (default `google/gemini-3.5-flash`) instead of a hardcoded constant. same sanitization, timeout, one-retry-on-transient discipline as the v2 client.
7. **cross-check** — compare AI output against the regex candidate:
   - amounts agree (±0.01, same currency) and types agree → `confidence: 'high'`.
   - regex found nothing (AI-only parse) → keep AI's own confidence.
   - amounts/types disagree → persist the AI result but set `needs_review: 1`. the regex candidate is kept in `raw_text` context anyway; the digest and a future review screen surface these.
8. **persist + writeback** — if `is_transaction: false`, record the row in a new `skipped_messages` table (guid, sender, reason, raw text) — *not* in `transactions` — so audits can verify nothing real was dropped, and the guid dedupe still prevents reprocessing. if true, insert the transaction and upsert an `auto` alias (raw regex merchant → AI canonical merchant + category), as v2 does.

**failure fallback:** openrouter error (timeout, 5xx, budget cap, bad JSON after retry) → persist the regex result if it parsed (`parsed_by: 'regex'`, confidence capped at `'medium'`, `needs_review: 1`), else `parsed_by: 'failed'` with `parse_attempts` incremented. rows with `parsed_by: 'failed'` and `parse_attempts < 3` are re-tried on subsequent polls, so an openrouter outage heals itself without manual intervention. the pipeline never blocks the cursor on an AI failure (v2's per-row cursor discipline is kept).

**caching / cost controls:**

- **template cache** — new `message_templates` table. fingerprint = sha256 of the body with digits, amounts, dates, and reference tokens masked (`Rs.1,234.00 spent on HDFC card xx1234 at SWIGGY on 12-07-26` → `Rs.# spent on HDFC card xx# at SWIGGY on #`). each row stores the fingerprint, verdict (`transaction` | `non_transaction`), hit count, and last AI output shape. a fingerprint that has been AI-verified ≥3 times with consistent verdicts becomes a *known-good template*, enabling the fast-path (step 5) and letting known non-transaction templates (a bank's recurring statement notice) be dropped at step 2 pricing. amounts/dates are always taken from the live regex extraction, never the cache.
- **daily budget cap** — config key `openrouter_daily_cap` (call count, default 200). over cap → fallback path, kuma-visible log line. protects against an ingest loop bug turning into a bill.
- one retry on transients only; 15s timeout; single message per call (batching not worth it at this volume).

**expected steady state:** first weeks nearly every message hits the LLM (building templates/aliases); after that the fast-path + guard absorb the recurring majority and the LLM sees genuinely new templates only.

### 2. AI response schema v2

extends the v2 openrouter schema. strict JSON schema via `response_format`, zod-validated:

```jsonc
{
  "is_transaction": true,          // false: OTP, promo, statement, payment-due,
                                   // e-mandate, and UPCOMING/SCHEDULED AUTOPAY
                                   // pre-debit notices ("will be debited") —
                                   // announcements are not debits
  "type": "expense",               // "income" | "expense" | "investment"
  "currency": "USD",               // ISO 4217; "INR" for the normal case
  "original_amount": 12.99,        // amount in `currency`
  "amount_inr": null,              // INR amount ONLY if the SMS itself states it
                                   // (many bank alerts show both); null otherwise —
                                   // never model-estimated FX
  "merchant": "Spotify",           // clean display name; codes/UPI suffixes stripped
  "category": "Entertainment",     // enum: canonical vocabulary for `type`
  "date": "2026-07-16",
  "reference_number": "…",         // UTR/RRN/txn id or null
  "confidence": "high"             // high | medium | low
}
```

prompt additions over v2: the upcoming-AutoPay rule spelled out with examples ("upcoming AutoPay", "will be debited on", "scheduled for", "mandate will be executed" → `is_transaction: false`); foreign-currency rule (never convert yourself; report what the SMS states); investment rule (mutual fund/SIP/broker debits like Zerodha, Groww, NPS → `type: 'investment'`); the alias context line ("known merchant for this pattern: X, category Y") when an alias hit exists; category enum swapped per `type`.

INR resolution at persist time: `amount = amount_inr ?? (currency === 'INR' ? original_amount : original_amount * fx_rate)` where `fx_rate` comes from the `fx_rates` config table (manually maintained, e.g. `USD: 88`). when a table rate is used, `needs_review: 1` — good enough for insights, flagged for correction against the card statement.

### 3. remote parse api — `POST /parse`

the app's paste sheet (and any future notification-forwarding path) calls the mini instead of on-device gemini.

```
POST /parse
Authorization: Bearer <existing kharcha-mini-api-token>
Content-Type: application/json

{ "text": "<raw pasted SMS/notification/email snippet>",
  "hint": { "bankName": "HDFC Bank", "receivedAt": "2026-07-16T21:04:00" },  // optional
  "store": false }                                                          // default false
```

response `200`:

```jsonc
{ "parsed": { /* AI response schema v2, plus resolved amount (INR) */ },
  "source": "ai" | "regex" | "alias",   // which layer produced it
  "transactionId": null }               // set only when store:true inserted a row
```

- runs the same pipeline as ingestion (guard → regex → alias → AI → cross-check) minus the allowlist (pasted text has no sender). `is_transaction: false` returns `200` with `parsed.is_transaction: false` — the app shows "not a transaction", it is not an error.
- `store: false` (the paste-sheet default): pure function, nothing persisted, no guid. the app shows the preview, the user confirms/edits, and the confirmed transaction is saved locally + pushed via the existing `POST /transactions` — the normal push/dedupe path. this avoids double-insert and keeps the mini's transactions table free of speculative rows.
- `store: true` reserved for future headless callers (notification forwarder) that want parse+persist in one hop; guid is `parse-<sha256(text)>` for idempotency.
- errors: `401` bad token, `400` empty/oversized text (cap 4000 chars), `502` when both AI and regex produced nothing usable (`{"error":"UNPARSEABLE"}`), `503` over daily budget cap.

**app-side behavior:**

- new `lib/mini-parse.ts`: thin fetch wrapper, same env config (`MINI_API_URL`, `MINI_API_TOKEN`), 15s timeout, no retry (the user is staring at a spinner; fail fast).
- **offline / off-tailnet degradation:** on network error or timeout, the paste sheet falls back to the app's local `lib/parsers/` regex fast-path (which is kept for exactly this) and labels the result "parsed offline — lower accuracy". if regex also fails, the sheet drops into the manual-entry form with the raw text pre-filled in the note. no queued retry — pasting again when back on the tailnet is the retry.
- **what stays in the app:** `lib/parsers/` (offline fallback), the paste sheet UI, manual entry, local db + sync client, insights. **what goes:** `lib/gemini/`, `EXPO_PUBLIC_GEMINI_API_KEY`, and — once phase 3 has soaked — the frozen gmail sync + oauth (the v2 "remove later" list finally executes, contingent on step-5-not-needed holding).

### 4. schema evolution

**mini (`src/db/schema.ts`), additive migration:**

```sql
ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN original_amount REAL;   -- null ⇒ equals amount (INR-native)
ALTER TABLE transactions ADD COLUMN fx_rate REAL;           -- rate used when amount was table-converted
ALTER TABLE transactions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN parse_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN parse_version INTEGER NOT NULL DEFAULT 1;  -- 1=v2 regex-era, 2=v3 ai-first
ALTER TABLE transactions ADD COLUMN deleted_at TEXT;        -- tombstone for the repair pass

CREATE TABLE message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  verdict TEXT NOT NULL,               -- 'transaction' | 'non_transaction'
  sample_guid TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE skipped_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_message_guid TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  reason TEXT NOT NULL,                -- 'guard:otp' | 'ai:non_transaction' | 'template:non_transaction' …
  raw_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

`amount` stays "the INR number" — every existing query, digest, and the app sync keep working untouched. `parsed_by` keeps its enum; `'openrouter'` now means "AI-parsed" (no value rename, no data rewrite). `type` already has `'investment'` on both sides since the recent change — the AI schema and `/parse` simply start emitting it.

**app (`lib/db/schema.ts` + `initDB()` inline DDL, per docs/DRIZZLE.md):**

```sql
ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN original_amount REAL;
```

- widen the app's `parsed_by` enum: `["regex", "gemini", "openrouter", "manual"]` (`gemini` kept for historical rows; nothing new writes it).
- transaction detail UI shows `"$12.99 (₹1,143)"` when `currency !== 'INR'`; insights keep summing `amount` (INR) — no chart changes.
- **coexistence rules:** manual/backfilled rows are INR-native (`currency='INR'`, `original_amount` null) and need nothing. mini-synced rows carry whatever the pipeline resolved. `parse_version` stays mini-side only — the app doesn't care how a row was parsed, only what it says.

### 5. app debt fixes (phase 0 — independent of everything above)

1. **WAL export/import bug.** `exportDatabase()` checkpoints and copies the live db file — but the copied file is still stamped `journal_mode=WAL`, and `SQLite.deserializeDatabaseAsync` cannot open WAL-mode bytes, so the app's own import preview rejects its own export. fix: export via `VACUUM INTO` (`db.execSync("VACUUM INTO '<cache path>'")`) which produces a compact, non-WAL, self-contained snapshot; drop the manual checkpoint+copy. import side unchanged. files: `lib/db/backup.ts` (`lib/db/inspect.ts` untouched).
2. **pull path skips `parsedBy: 'manual'`.** `mapParsedBy()` in `lib/mini-sync.ts` returns null for `'manual'`, so app-pushed manual entries (and any mini-side manual inserts) never come back on a fresh install — restore-from-mini is silently partial. fix: map `'manual'` → the app's `'manual'` parsed_by (enum widened above). `'failed'` rows stay skipped — under v3 they are transient retry states, not data.
3. **pull pagination.** one 200-row page per sync call means a fresh install needs many pull-to-refreshes to catch up. fix: loop `fetchMiniTransactions` until a page returns fewer than `limit` rows (safety cap 25 pages ≈ 5000 rows/sync), advancing the cursor per page so an interrupted sync resumes correctly.

### 6. historical repair pass (one-time, audit-informed)

a mini-side script (`bun run reparse`), driven by the audit's findings. never runs unattended.

1. **select suspects** (any of): `raw_text` matching upcoming-AutoPay/mandate phrasing; `raw_text` containing `USD|\$|EUR|GBP` with `currency='INR'`; merchant matching generic placeholders or code-residue patterns (`P2M|P2A|@ok|@ybl|^UPI`, all-caps hashes); `category IN ('Other', NULL)` on rows the audit flagged; anything `parse_version=1` the audit lists explicitly.
2. **dry run:** re-run each suspect's `raw_text` through the full v3 pipeline (respecting the budget cap, spread across runs if needed). write a diff report — `old → new` per field, plus proposed **voids** (rows the AI now says `is_transaction: false`, i.e. the AutoPay ghosts) — to a tsv for owner review. nothing is written to `transactions`.
3. **apply (explicit `--apply` flag):** update rows in place (`parse_version=2`, `updated_at` bumped); voided rows get `deleted_at` set (tombstone, never hard-deleted — the guid must keep blocking re-ingestion). merchant corrections write `manual`-source aliases so they stick.
4. **propagate to the app:** the pull cursor is id-based, so edits to already-synced rows won't flow. rather than building an updated-since sync protocol for a one-time event, the app gets a settings action **"re-sync from mini"**: delete all local rows with `mini_transaction_id NOT NULL`, reset `MINI_SYNC_LAST_ID` to 0, run a full paginated pull (phase 0's pagination makes this cheap). the pull filter adds `WHERE deleted_at IS NULL` mini-side (`GET /transactions` simply stops returning tombstoned rows). manual/local rows are untouched by the wipe.

## phased plan

each phase ships alone and is verified before the next starts.

**phase 0 — app debt fixes** (app repo only, no mini changes)
- VACUUM INTO export; manual-row mapping; paginated pull; parsed_by enum widen + migration (`pnpm drizzle:generate` + inline DDL sync).
- verify: export a backup → immediately import it → preview shows correct stats and commits clean. on a scratch install: fresh pull retrieves the full mini history including manual rows in one sync; row count matches `sqlite3 kharcha-mini.db 'select count(*) from transactions'`.

**phase 1 — mini schema + vocabulary** (mini repo; also: make the mini a git repo first — the v2 known-limitation, non-negotiiable before this much surgery)
- additive migration above; migrate alias/transaction categories to the canonical vocabulary; seed the app's categories to match (app-side seed tweak rides the phase 0 release or a follow-up).
- verify: ingest poll runs green post-migration; `select distinct category` on both dbs shows only canonical values; app sync no longer lands everything in "Other".

**phase 2 — ai-first pipeline** (mini repo, flag-gated)
- new pipeline behind config key `parse_mode` (`regex_first` = today, `ai_first` = v3). ship in **shadow mode** first: `ai_first` logic runs and logs its full would-be output per message, but `regex_first` remains canonical. after ~1–2 weeks, diff shadow log vs canonical: AutoPay notices correctly rejected? currencies caught? category spread sane? cost within cap? then flip `parse_mode=ai_first`.
- verify: shadow diff review (the real gate); post-flip, one live poll cycle watched end-to-end; `skipped_messages` sampled to confirm nothing real is being dropped; kuma heartbeat + digest still green.

**phase 3 — `POST /parse` + app rewire**
- endpoint on the mini (reuses the phase 2 pipeline); `lib/mini-parse.ts` in the app; paste sheet calls it with regex-offline fallback; delete `lib/gemini/` + the gemini env key.
- verify: paste a real bank SMS on-tailnet → correct preview incl. a USD case and an AutoPay case (rejected). airplane-mode paste → offline regex fallback labeled correctly → manual form fallback. `pnpm quality` + `pnpm dead-code` pass after the gemini removal.

**phase 4 — historical repair**
- `bun run reparse` dry-run against the audit's suspect list → owner reviews tsv → `--apply` → app "re-sync from mini".
- verify: spot-check 20 diff rows before apply; after apply, insights totals move in the audited direction (AutoPay ghosts gone → monthly spend drops by the known phantom amount); app re-sync count matches mini non-tombstoned count; no manual rows lost (count before == after for `mini_transaction_id IS NULL`).

**phase 5 (conditional, unchanged from v2)** — gmail ingestion on the mini, only if real gaps show. after phase 3 soaks, the app's frozen gmail stack is removed either way once this is decided.

## risks

- **AI misclassifies a real debit as a notice** (inverse of today's bug). mitigations: shadow mode before the flip; `skipped_messages` keeps every reject auditable with raw text; deterministic guard only drops zero-false-positive patterns; digest can surface a daily skip count.
- **openrouter outage or model drift.** regex fallback + retry-on-next-poll means no data loss, only degraded quality until it heals. model is config-keyed; a drift (schema violations spiking) shows up in the error log and can be repinned without a deploy.
- **template cache poisoning** — a bank changes wording such that a cached non-transaction template now matches real transactions. mitigations: fingerprints mask only values, not wording, so a wording change is a *new* fingerprint; verified_count threshold before fast-path; periodic re-verify (1 in N fast-path hits goes to the AI anyway).
- **cost runaway.** daily cap + volume is tiny; worst case is the cap, not a bill.
- **repair pass corrupts history.** dry-run + owner-reviewed diff + tombstones-not-deletes + a `cp` of `kharcha-mini.db` before `--apply` (runbook §10). the app re-sync only touches `mini_transaction_id` rows.
- **icloud SMS sync flakiness** — unchanged from v2, still the weakest link, unaffected by this spec. `/parse` actually softens it: anything missed can be pasted through the same brain.
- **tailscale serve/funnel confusion** (v2 known limitation) applies to nothing new here — `/parse` rides the existing 8300 serve; the never-funnel rule stands.

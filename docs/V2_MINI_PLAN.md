# kharcha v2 — mac mini pipeline progress report

date: 2026-07-15. status: steps 1-4 built, live, and verified end-to-end on-device. step 5 not started (conditional, may never be needed).

## problem (why this exists)

the app's capture layer was unreliable once daily manual syncing stopped:

- gmail sync is foreground-only (ios limitation) — data goes stale between opens
- ai parsing misidentified messages (promos/otps parsed as transactions, wrong vendor/category) — biggest pain point
- 7-day sideload expiry (free apple dev account) could strand the app while outside
- ios never allows apps to read sms, so the richest source was never available to the app

## decision

move ingestion off the phone to the always-on mac mini. the mini is the canonical data store; the app is a client (ui + insights + manual entry + sync). no other users — this stays a personal single-tenant setup.

sms is the primary source. gmail sync stays frozen in the app (untouched, still works) as a fallback — not yet needed on the mini, see step 5.

## architecture (as built)

```
iphone sms ──icloud sync──> mini chat.db ──launchd poll (15 min)──> parser ──> canonical sqlite (mini)
                                                              │
                              regex (primary) ── low-confidence ──> openrouter proofread (flag: on)
                                                              │
                                              merchant_aliases lookup
                                                              │
              api (127.0.0.1:8300, tailscale serve) <────────┤
                     │                                       └──> hermes telegram digest (draft, not applied)
        app sync client (pull/push over tailnet) ── LIVE, verified against real data
```

Mini project: `~/apps/kharcha-mini` (separate repo, Bun + TypeScript, not this one).

## status by step

### 1. mini: ingestion — ✅ live
- chat.db reader, sender allowlist (substring match on carrier-prefix/relay-suffix variants — a real DLT header shows up as 5-10+ distinct strings depending on carrier), ported regex parsers, launchd job (`com.chetan.kharcha-mini-ingest`, 15-min poll)
- real parse rates on live data: **Axis 881/1229 (71.7%)**, **HDFC 314/342 (91.8%)** — remaining failures are legitimate non-transaction notices (OTP, statements, mandate/payment-due reminders), verified by sampling, not a parser gap
- one real decoder bug found and fixed post-launch: `attributedBody` streamtyped marker-byte handling (0x00/0x01 prefix) was corrupting a chunk of historically-ingested messages; fixed and backfilled via a one-off re-hydration pass against the real db

### 2. mini: intelligence — ✅ live, flag on
- `merchant_aliases` table (exact match, no vector store, as decided)
- openrouter proofread pinned to `google/gemini-3.5-flash`, `openrouter_proofread_enabled` flag currently **on**
- non-transaction guard (OTP/statement/mandate detection) shared between the regex layer and the proofread trigger, plus an `is_transaction: false` safety net in the AI response schema — added after the panel review flagged that the original design would've sent OTPs to the LLM

### 3. mini: access — ✅ live
- API on `127.0.0.1:8300`, bearer-token auth (Keychain-stored, `kharcha-mini-api-token`), `tailscale serve` (tailnet-only, **never funnel** — this bit us once already, see known limitations)
  - **superseded 2026-08-03:** the bearer token is gone (kharcha-mini `f2ceec3`, `df2d3ac`). Every route is open and an `Authorization` header is ignored rather than validated. The tailnet boundary is now the whole of the access control, which makes the never-funnel rule above load-bearing rather than merely advisable. The rest of this document stands as the 2026-07-15 record.
- `net-watchdog.sh` extended to guard port 8300 against a funnel rule
- daily telegram digest via hermes: **drafted, not applied** (`scripts/digest-telegram.sh` + proposed `jobs.json` entry exist in the mini repo, review before wiring into the live hermes config)
- dropped from v1 per plan: `POST /sync/run` on-demand trigger (marginal value over the 15-min poll)

### 4. app: sync client — ✅ live, verified end-to-end on-device
- `lib/mini-sync.ts` (pull + push, two-tier dedupe: `mini_transaction_id` primary, `findDuplicateTransaction` fallback), `hooks/use-mini-sync.ts`, wired into pull-to-refresh and app-foreground
- schema: `mini_transaction_id` (unique), `reference_number`, widened `source_type`/`parsed_by` enums — migration tested against a real 440-transaction backup copy before touching the live app
- push path (manual/cash entries): fire-and-forget, no retry queue, per the locked-in v1 scope decision
- **caught and fixed before shipping**: the first-ever `drizzle:generate` run produced a migration that would have crashed the app's db layer on next launch (tried to `CREATE TABLE` on tables that already exist via the inline safety net). fixed to be idempotent, re-verified against real data. also caught: a category-type-matching bug that would've silently dropped categories on every income transaction synced from the mini.
- **caught and fixed getting the app to actually build/run**: `node_modules` was silently corrupted by iCloud Desktop sync (hundreds of `" 2"`-suffixed conflict-duplicate files from installing thousands of files faster than iCloud could sync) — excluded `node_modules`/`ios`/`android` from iCloud via `com.apple.fileprovider.ignore`; `babel.config.js` was missing the `inline-import` plugin needed to inline the new `.sql` migration file as a string (metro registered `.sql` as a source ext, but nothing told babel to stop parsing it as JS); `assets/splash-icon.png` was referenced by `app.json` but never existed, breaking every native prebuild regardless of the mini-sync work
- verified live on a physical-device Release build (`pnpm ios:device`): pull-to-refresh pulls real mini-pipeline transactions (Swiggy, Netflix, UPI payments, etc.) tagged `MINI`, correct amounts/dates, against the real mini API and months of real production data
- known follow-up (not a bug, not yet done): mini-side category names don't match the app's seeded category names, so everything synced lands in "Other" until either is aligned; mini-side merchant strings aren't normalized (e.g. "Swiggy" / "Swiggy Ltd" / "Swiggy Limited" as distinct merchants) — a mini-repo parser/alias tuning task, not an app-side bug

### 5. mini: gmail ingestion — not started, conditional
only if steps 1-4 show real sms gaps (refunds, international txns, icloud sync breakage) over real usage. no signal yet either way.

## app: keep / freeze / remove

- keep: insights ui, all screens, manual entry, local db (now also a sync cache for the mini)
- freeze (unchanged, still working): in-app gmail sync, gemini parsing, paste sheet
- remove later: gmail oauth, gemini key, paste sheet — only after step 5 either lands or is confirmed unnecessary

## known limitations

- 7-day sideload expiry remains (app is still sideloaded). blast radius is smaller now: the mini keeps ingesting and the tailnet api still serves data if the app expires while outside
- icloud sms sync is the flakiest link — why gmail stays as a frozen (not deleted) fallback
- `tailscale funnel` and `tailscale serve` share the same combined status output on this tailscale version (1.98.5) — a naive "clear forbidden funnel rules" check can misfire and tear down a legitimate serve rule (happened once during step 3 rollout, fixed same night). any future automation touching tailscale state on this box should account for this
- the mini isn't a git repo yet — no version history for `~/apps/kharcha-mini`'s code
- publishing for other users is parked: would need a multi-tenant backend, out of scope, not reconsidered

## parked (v-next)

- gmail/ssh/wiz automations built on the same mini pipeline
- local models for parsing
- publishing the app

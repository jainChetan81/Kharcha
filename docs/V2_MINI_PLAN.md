# kharcha v2 — mac mini pipeline plan

date: 2026-07-14. status: planned, not started.

## problem

the app's capture layer is unreliable now that daily manual syncing has stopped:

- gmail sync is foreground-only (ios limitation) — data goes stale between opens
- ai parsing misidentifies messages (promos/otps parsed as transactions, wrong vendor/category) — biggest pain point
- 7-day sideload expiry (free apple dev account) can strand the app while outside
- ios never allows apps to read sms, so the richest source was never available to the app

## decision

move ingestion off the phone to the always-on mac mini. the mini becomes the canonical data store; the app becomes a client (ui + insights + manual entry + sync). no other users — this stays a personal single-tenant setup.

sms is the primary source (dlt sms covers nearly all debits/credits in india). gmail becomes the fallback on the mini, added only if sms-only shows gaps after 2-4 weeks against a statement.

## architecture

```
iphone sms ──icloud sync──> mini chat.db ──launchd poll──> parser ──> canonical sqlite (mini)
                                                              │
                              regex (primary) ── low-confidence ──> openrouter proofread
                                                              │
                                              merchant_aliases lookup
                                                              │
              api (127.0.0.1, tailscale serve) <──────────────┤
                     │                                        └──> hermes telegram digest
        app sync client (pull/push over tailnet)
```

## parsing rules

1. sender-id allowlist first (HDFCBK, ICICIB, etc. dlt headers) — non-bank senders never reach a parser. this kills the misidentification problem at the gate
2. deterministic regex per bank template (port logic from `lib/parsers/`) — primary path, expected ~95%+ coverage
3. openrouter (flash-tier) proofread only on low-confidence or unmatched messages. no local models
4. `merchant_aliases` table: raw string → vendor → category. every manual correction writes back, so repeat merchants are never misidentified twice. plain sqlite table, no vector store

## build order

### 1. mini: ingestion
- chat.db reader (`~/Library/Messages/chat.db`, needs full disk access + text message forwarding / messages in icloud on)
- sender allowlist + ported regex parsers
- canonical sqlite db on the mini
- launchd job, 15-min interval (watch the known launchd gotchas: stripped PATH, process-group reaping)

### 2. mini: intelligence
- openrouter proofread pass on low-confidence parses
- `merchant_aliases` table + correction write-back

### 3. mini: access
- small api: list/query transactions, insert manual entry
- bind 127.0.0.1 only, expose via tailscale serve (hard rule: never 0.0.0.0 + serve on the same port)
- on-demand "sync now" trigger endpoint
- daily telegram digest via hermes

### 4. app: sync client
- pull new transactions from mini api over tailnet
- push manual/cash entries up
- dedupe on fingerprint: bank ref no + amount + timestamp
- offline-safe: app unreachable for a week = mini keeps ingesting, app catches up on next open

### 5. mini: gmail ingestion (conditional)
- only if step 1-4 shows sms gaps (refunds, international txns, icloud sync breakage)
- one-time refresh token + gmail api polling script; parsing logic ports from `lib/gmail/`
- once stable, delete the in-app gmail sync

## app: keep / freeze / remove

- keep: insights ui, all screens, manual entry, local db (as sync cache)
- freeze (no changes until mini proves itself): in-app gmail sync, gemini parsing, paste sheet
- remove later: gmail oauth, gemini key, paste sheet — after step 5

## known limitations

- 7-day sideload expiry remains (app is still sideloaded). blast radius shrinks: mini keeps ingesting and the tailnet api/dashboard still serves data if the app expires while outside. paid apple dev account (₹8k/yr, 90-day testflight builds) is the fix if it stays annoying
- icloud sms sync is the flakiest link — this is why gmail stays as a planned fallback rather than being deleted
- publishing for other users is parked: would need a multi-tenant backend, out of scope

## parked (v-next)

- gmail/ssh/wiz automations built on the same mini pipeline
- local models for parsing
- publishing the app

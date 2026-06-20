# Plan 006: Harden the backend webhook (timing-safe token compare, stop logging the forwarding token) and document the device-auth model

> **Executor instructions**: Follow this plan step by step. This plan touches
> `kharcha-backend/` ONLY — it is a separate Bun project with its own
> conventions (tabs, double quotes, constants in `src/lib/constants.ts`).
> Run every verification command and confirm the expected result before
> moving on. Honor the STOP conditions. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 20fc794..HEAD -- kharcha-backend/src/routes/webhook.ts kharcha-backend/src/lib/auth.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `20fc794`, 2026-06-10

## Why this matters

Three related items on the backend's auth surface. (1) The Postmark webhook validates its secret URL token with plain `!==` — a constant-time comparison is a one-line hardening that removes the theoretical timing oracle. (2) The webhook logs the local-part of the forwarding address (`sync+<token>@…`), which **is** the per-device routing token — anyone with log access can forge transaction emails for that device; redact it. (3) Device sync authenticates with the bare `x-device-id` header — an identifier, not a secret. That's an accepted design for a personal deployment, but it should be written down as a decision, with the upgrade path noted, so it isn't rediscovered as a "vulnerability" every audit.

## Current state

- `kharcha-backend/src/routes/webhook.ts:23-30` — token check:
  ```ts
  webhook.post("/email/:token", async (c) => {
  	const token = c.req.param("token");

  	if (token !== env.POSTMARK_WEBHOOK_TOKEN) {
  		throw new HTTPException(401, {
  			message: ERROR_MESSAGES.INVALID_WEBHOOK_TOKEN,
  		});
  	}
  ```
- `kharcha-backend/src/routes/webhook.ts:69-71` — the leaky log:
  ```ts
  	console.log(
  		`[webhook] from=${From.split("@")[1] ?? "unknown"} to=${toEmail.split("@")[0] ?? "unknown"}`,
  	);
  ```
  `toEmail` is the forwarding address; its local part (`sync+<token>`) is matched at line 73 (`toEmail.match(/sync\+([^@]+)@/)`) and maps to a device — i.e. the local part is the secret-ish routing token.
- `kharcha-backend/src/lib/auth.ts` — `authMiddleware`: reads `x-device-id` header, looks the device up in Postgres, 401 if missing/unregistered. No second factor.
- `env.POSTMARK_WEBHOOK_TOKEN` is validated as required at `kharcha-backend/src/lib/env.ts:16`.
- Runtime is **Bun**; `node:crypto`'s `timingSafeEqual` is available in Bun.
- Backend conventions (`kharcha-backend/CLAUDE.md`): constants/error messages in `src/lib/constants.ts`; route handlers thin, logic in `lib/`; tabs + double quotes (Biome).
- Backend commands (from `kharcha-backend/package.json` per its CLAUDE.md): `bun run lint`, `bun run typecheck`, `bun run quality`.

## Commands you will need

Run these **inside `kharcha-backend/`**:

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `bun run typecheck` | exit 0              |
| Lint      | `bun run lint`      | exit 0              |

(Repo convention for the root app is to ask the operator to run package commands; apply the same courtesy here unless your harness has permission.)

## Scope

**In scope**:
- `kharcha-backend/src/routes/webhook.ts`
- `kharcha-backend/src/lib/auth.ts` (documentation comment only)
- `kharcha-backend/src/lib/` (new small helper file for the comparison, if you prefer it over inlining)
- `kharcha-backend/docs/` or `kharcha-backend/README.md` (auth-model note)

**Out of scope** (do NOT touch):
- Implementing a per-device secret / registration token — that is a schema + app + migration change; this plan only documents it as the upgrade path.
- The mobile app (`lib/`, `hooks/`, `app/` at repo root).
- Rate-limiting config in `kharcha-backend/src/index.ts`.

## Git workflow

- Branch: `advisor/006-backend-hardening`
- Commit style: `fix(backend): timing-safe webhook token compare; redact forwarding token from logs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Timing-safe token comparison

In `webhook.ts`, replace the `!==` check. Compare SHA-256 digests so unequal lengths can't throw or leak:

```ts
import { createHash, timingSafeEqual } from "node:crypto";

function safeTokenEqual(a: string, b: string): boolean {
	const da = createHash("sha256").update(a).digest();
	const db = createHash("sha256").update(b).digest();
	return timingSafeEqual(da, db);
}
```

Place the helper in `src/lib/` (e.g. `src/lib/crypto.ts`) per the thin-routes convention, then:

```ts
	if (!safeTokenEqual(token, env.POSTMARK_WEBHOOK_TOKEN)) {
```

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 2: Redact the forwarding token from the log line

Change line 69-71 so neither side logs a routable secret — keep the operational value (which bank sender, was it a sync address) without the token:

```ts
	console.log(
		`[webhook] from=${From.split("@")[1] ?? "unknown"} sync_addr=${/sync\+[^@]+@/.test(toEmail)}`,
	);
  ```

Grep the rest of the file (and `src/routes/`) for other `toEmail`/forwarding-address logging and apply the same redaction; report any you change.

**Verify**: `grep -n 'toEmail.split("@")\[0\]' kharcha-backend/src/routes/webhook.ts` → no matches; `bun run lint` → exit 0.

### Step 3: Document the device-auth decision

Add a short comment block above `authMiddleware` in `src/lib/auth.ts`:

```ts
// AUTH MODEL (deliberate): the x-device-id header is an identifier, not a
// secret — possession of a registered device id grants read/write for that
// device's rows. Acceptable for a single-operator deployment where ids are
// high-entropy and never published. If this backend ever serves untrusted
// users, add a per-device secret issued at /register and require it here.
```

Mirror one paragraph in `kharcha-backend/README.md` (or `docs/` if a security section exists — read the README first and match its structure).

**Verify**: `bun run quality` → exit 0.

## Test plan

Backend has no test framework (known gap, recorded in plan 001's maintenance notes). Machine checks are the greps + typecheck/lint. Operator check: send a request to the webhook with a wrong token → 401; with the right token (via Postmark test or curl with a sample payload) → 200 and the new log format.

## Done criteria

- [ ] `grep -n "!== env.POSTMARK_WEBHOOK_TOKEN" kharcha-backend/src/routes/webhook.ts` → no matches
- [ ] No log statement prints the `sync+<token>` local part (grep check from step 2)
- [ ] Auth-model comment present in `src/lib/auth.ts` and README
- [ ] `bun run quality` exits 0 in `kharcha-backend/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `timingSafeEqual` is unavailable in the deployed Bun version (typecheck or runtime error) — report the Bun version.
- You find other endpoints comparing secrets with `===`/`!==` while grepping — list them in your report; fix only the webhook one here.
- The webhook file has drifted from the excerpts.

## Maintenance notes

- The documented upgrade path (per-device secret) becomes mandatory if the backend ever serves more than the operator's own devices — treat any multi-user ambition as the trigger.
- Reviewer: confirm the hash-then-compare pattern (not raw `timingSafeEqual` on unequal-length buffers, which throws).
- Deferred: structured logging with redaction middleware — overkill at current scale.

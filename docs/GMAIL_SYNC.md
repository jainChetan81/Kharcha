# gmail sync

automatic expense tracking by reading bank transaction emails from gmail + backend email forwarding.

supports 12 banks: **axis, hdfc, icici, sbi, kotak, indusind, standard chartered, idfc, citi, hsbc, fintech cards**. gemini AI fallback for unrecognized email formats.

---

## architecture

### on-device sync (gmail API)

```
lib/gmail/
  auth.ts           useGoogleAuth hook — platform-specific sign-in
  parsers/           bank-specific regex parsers (12 banks)
    axis.ts          axis bank (UPI, credit card, IMPS)
    hdfc.ts          hdfc bank (debit alerts, credit card)
    icici.ts         icici bank
    sbi.ts           sbi
    kotak.ts         kotak mahindra bank
    indusind.ts      indusind bank
    sc.ts            standard chartered
    idfc.ts          idfc bank
    citi.ts          citi cards
    hsbc.ts          hsbc
    fintech-cards.ts fintech/digital cards
    index.ts         parser registry + dispatch
    utils.ts         shared parsing helpers
  sync.ts            fetch gmail messages, parse, dedup, insert

lib/gemini/          gemini 1.5 flash AI fallback for unrecognized formats
lib/env.ts           validates EXPO_PUBLIC_GOOGLE_* env vars (alert on missing)
lib/db/config.ts     stores gmail_connected, gmail_last_synced_at, gmail_emails_fetched
lib/db/banks.ts      bank + bank_emails CRUD
```

### backend sync (device sync)

```
kharcha-backend/
  src/               bun + hono API
  docker-compose.yml postgres + app containers

app/settings/sync.tsx     register device, get forwarding email, sync
app/settings/banks.tsx    manage bank parsers
```

the backend receives forwarded bank alert emails via postmark inbound webhooks, parses them, and stores transactions in postgres. the mobile app syncs from the backend via HTTP.

---

## env vars (required)

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...     # iOS OAuth client
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...     # Web client (used for Android + token exchange)
```

the Android OAuth client ID is NOT in env — it's matched by SHA-1 + package name at the native level.

set in `.env.local` for dev, EAS Secrets for builds.

---

## oauth setup (google cloud console)

1. console.cloud.google.com -> create project "kharcha"
2. enable Gmail API
3. create OAuth consent screen (external, testing mode)
4. add test users (your gmail address)
5. create 3 credentials:

| client type | purpose |
|---|---|
| iOS | iOS sign-in via expo-auth-session |
| Web | token exchange (all platforms) + Android `webClientId` |
| Android | native Android sign-in (matched by SHA-1 + package name) |

6. **iOS client**: bundle ID `com.chetanjain.kharcha`
7. **Web client**: no redirect URI needed (token exchange only)
8. **Android client**: package name `com.chetanjain.kharcha` + SHA-1 from `cd android && ./gradlew signingReport`
9. scope: `https://www.googleapis.com/auth/gmail.readonly`

---

## platform-specific auth

| | iOS | Android |
|---|---|---|
| library | expo-auth-session | @react-native-google-signin/google-signin |
| client ID | iOS client ID | Web client ID (as `webClientId`) |
| redirect | `com.chetanjain.kharcha:/oauthredirect` | native (no redirect URI needed) |
| token storage | expo-secure-store | GoogleSignin.getTokens() + expo-secure-store |
| token refresh | AuthSession.refreshAsync | GoogleSignin.getTokens() (auto-refreshes) |

Android uses `@react-native-google-signin/google-signin` because Google rejects custom scheme redirect URIs (`kharcha://`) for Web/Android OAuth clients. The native library handles the OAuth flow via Google Play Services.

---

## connect flow

**iOS:**

```
"Connect Gmail" -> expo-auth-session opens consent screen
-> user approves gmail.readonly
-> deep link redirect with auth code
-> AuthSession.exchangeCodeAsync -> access + refresh tokens
-> stored in expo-secure-store
```

**Android:**

```
"Connect Gmail" -> GoogleSignin.signIn() opens native consent screen
-> user approves gmail.readonly
-> GoogleSignin.getTokens() returns access token
-> stored in expo-secure-store
```

---

## on-device sync flow

```
"Sync Now" -> getValidAccessToken()
-> for each bank sender:
  -> gmail API: list messages matching sender + after:last_synced_at
  -> for each message: fetch snippet, parse with bank-specific regex
  -> if regex fails: fall back to gemini AI parsing
  -> dedup: same date + amount + note='synced from gmail'
  -> if new: insert transaction with source_type='synced'
-> update gmail_last_synced_at in config
-> show results sheet (added, duplicate, failed counts)
```

---

## email parsing

`lib/gmail/parsers/`:

| bank | parser file | extracts |
|---|---|---|
| axis bank | axis.ts | amount, date, merchant (UPI, credit card, IMPS) |
| hdfc bank | hdfc.ts | amount, date, merchant (debit alerts, credit card) |
| icici bank | icici.ts | amount, date, merchant |
| sbi | sbi.ts | amount, date, merchant |
| kotak mahindra | kotak.ts | amount, date, merchant |
| indusind bank | indusind.ts | amount, date, merchant |
| standard chartered | sc.ts | amount, date, merchant |
| idfc bank | idfc.ts | amount, date, merchant |
| citi cards | citi.ts | amount, date, merchant |
| hsbc | hsbc.ts | amount, date, merchant |
| fintech/digital | fintech-cards.ts | amount, date, merchant |

all parsed transactions default to category "other" (expense). gemini AI auto-categorisation suggests a category when available.

### gemini AI fallback

when regex parsers don't match, the email content is sent to gemini 1.5 flash for extraction. the AI prompt extracts amount, date, merchant, and suggests a category. responses are validated before inserting.

---

## backend sync (device sync)

### architecture

```
bank sends alert email -> user forwards to sync+{token}@mail.thechetanjain.com
-> postmark inbound webhook -> kharcha-backend parses + stores in postgres
-> mobile app: GET /sync (x-device-id header, last_synced_at query param)
-> new transactions returned -> inserted locally with source_type='synced'
```

### backend endpoints

| method | path | purpose |
|---|---|---|
| POST | /register | register device, get unique forwarding email |
| GET | /sync | fetch new transactions since last sync |
| POST | /webhook/email/:token | postmark inbound email handler |
| GET | /feature-flags | gmail sync visibility per user |
| GET | / | health check |

### mobile screens

- **settings/sync.tsx** — register device, copy forwarding email, manual sync trigger, sync from date picker
- **settings/banks.tsx** — manage registered banks and alert email addresses

---

## token management

| | iOS | Android |
|---|---|---|
| access token | expo-secure-store, ~1hr, refreshed via AuthSession | GoogleSignin.getTokens(), auto-refreshed |
| refresh token | expo-secure-store, long-lived | managed by Google Play Services |

---

## screens

- **profile.tsx** — connect/disconnect + last synced + sync now + app lock
- **gmail-sync.tsx** — full sync screen with stats, date picker, verify, sync, results sheet
- **settings/sync.tsx** — device sync registration + forwarding email + manual sync
- **settings/banks.tsx** — manage bank parsers and alert emails
- **transaction-item.tsx** — "GMAIL" badge (blue) on synced transactions

---

## feature flags

gmail sync visibility is controlled by the backend `/feature-flags` endpoint. the profile screen checks if the current `userName` is in the `gmail_sync_enabled_for` list before showing sync options.

controlled via `GMAIL_SYNC_ENABLED_FOR` env var (comma-separated) on the backend.

---

## troubleshooting

**Android: "DEVELOPER_ERROR" on sign-in:**
- SHA-1 fingerprint in Google Cloud doesn't match your build
- run `cd android && ./gradlew signingReport` and update the Android OAuth client

**iOS: redirect fails:**
- check bundle ID matches in Google Cloud iOS client
- ensure `scheme: "kharcha"` is in app.json

**"Not authenticated" on sync:**
- token expired and refresh failed — disconnect and reconnect

**no emails found:**
- check "sync from" date in gmail-sync screen
- verify bank sender emails match parsers in `lib/gmail/parsers/`

**gemini AI returns bad data:**
- check network logs (about screen -> tap version 5x)
- gemini responses are validated — bad extractions are counted as "failed" in sync results

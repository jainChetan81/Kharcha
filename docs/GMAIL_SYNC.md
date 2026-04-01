# gmail sync

automatic expense tracking by reading bank transaction emails from gmail.
everything runs on-device. no backend.

supports: **axis bank** + **hdfc bank** email alerts.

---

## architecture

```
lib/gmail/
  auth.ts       useGoogleAuth hook — platform-specific sign-in
  parser.ts     parseAxisBankEmail, parseHdfcEmail, parseEmail
  sync.ts       syncGmailTransactions — fetch, parse, dedup, insert

lib/env.ts      validates EXPO_PUBLIC_GOOGLE_* env vars (alert on missing)
lib/db/config.ts  stores gmail_connected, gmail_last_synced_at, gmail_emails_fetched
```

---

## env vars (required)

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...     # iOS OAuth client
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...     # Web client (used for Android + token exchange)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET=... # Web client secret
```

the Android OAuth client ID is NOT in env — it's matched by SHA-1 + package name at the native level.

set in `.env.local` for dev, EAS Secrets for builds.

---

## oauth setup (google cloud console)

1. console.cloud.google.com → create project "kharcha"
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
"Connect Gmail" → expo-auth-session opens consent screen
→ user approves gmail.readonly
→ deep link redirect with auth code
→ AuthSession.exchangeCodeAsync → access + refresh tokens
→ stored in expo-secure-store
```

**Android:**
```
"Connect Gmail" → GoogleSignin.signIn() opens native consent screen
→ user approves gmail.readonly
→ GoogleSignin.getTokens() returns access token
→ stored in expo-secure-store
```

---

## sync flow

```
"Sync Now" → getValidAccessToken()
→ for each bank sender (axisbank, hdfcbank):
  → gmail API: list messages matching sender + after:last_synced_at
  → for each message: fetch snippet, parse with regex
  → dedup: same date + amount + note='synced from gmail'
  → if new: insert transaction with source_type='synced'
→ update gmail_last_synced_at in config
→ show result alert
```

---

## email parsing

`lib/gmail/parser.ts`:

| bank | sender | extracts |
|---|---|---|
| axis bank | alerts@axisbank.com | amount, date (DD-MM-YY), merchant |
| hdfc bank | alerts@hdfcbank.net | amount, date (DD Mon, YYYY), merchant |

all parsed transactions default to category "other" (expense).

---

## token management

| | iOS | Android |
|---|---|---|
| access token | expo-secure-store, ~1hr, refreshed via AuthSession | GoogleSignin.getTokens(), auto-refreshed |
| refresh token | expo-secure-store, long-lived | managed by Google Play Services |

---

## screens

- **profile.tsx** — connect/disconnect + last synced + sync now
- **gmail-sync.tsx** — full sync screen with stats, date picker, verify, sync
- **transaction-item.tsx** — "GMAIL" badge (blue) on synced transactions

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
- verify bank sender emails match `BANK_SENDERS` in sync.ts

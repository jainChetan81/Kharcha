# kharcha — phase 2: gmail sync

## overview

automatic expense tracking by reading axis bank transaction emails from gmail.
everything runs on-device. no backend, no server, no railway.

---

## tech

| package | purpose |
|---|---|
| expo-auth-session | google oauth + PKCE flow (no client secret needed) |
| expo-secure-store | encrypted storage for refresh token on device |
| expo-web-browser | opens google consent screen in browser |
| gmail API | fetch axis bank emails |

---

## oauth setup (google cloud console — one time)

1. go to console.cloud.google.com
2. create a new project — "kharcha"
3. enable gmail API
4. go to credentials → create OAuth 2.0 client ID
5. application type: iOS (for app store) + Android
6. add bundle ID: com.chetanjain.kharcha
7. download the client ID (no client secret needed for mobile PKCE flow)
8. add client ID to app config

---

## connect gmail flow (one time per user)

```
user taps "Connect Gmail" in profile
→ expo-auth-session opens google consent screen
→ user logs in with google account
→ user approves gmail read-only access scope
→ google returns access token + refresh token to app via deep link
→ app stores refresh token in expo-secure-store (encrypted)
→ app stores gmail_connected = true in settings table
→ profile screen shows "Gmail Connected ✓"
```

## sync flow (every time user taps sync)

```
user taps sync button (or opens app)
→ app reads refresh token from expo-secure-store
→ app uses refresh token to get fresh access token from google
→ app calls gmail API:
   - from: alerts@axisbank.com
   - after: last_synced_at from settings table
→ for each email:
   - decode base64 email body
   - run regex to extract: amount, merchant, date, type
   - check if transaction already exists (dedup by date + amount)
   - if new: insert into transactions table with source = 'axis bank'
→ update last_synced_at in settings table
→ show toast: "X new transactions added"
```

---

## regex patterns (axis bank email formats)

axis bank sends different email formats for different transaction types.
need to collect real email bodies and write regex for each.

known formats to handle:

- UPI debit
- credit card debit
- debit card debit
- UPI credit (refunds)

**example pattern (to be refined with real emails):**

```
debited INR ([\d,]+\.?\d*) on (\d{2}-\w{3}-\d{4})
```

---

## data flow

```
gmail API (google servers)
  → app (expo-auth-session + fetch)
  → regex parsing (on device)
  → expo-sqlite (drizzle)
  → UI (tanstack query)
```

---

## security

| data | storage | encryption |
|---|---|---|
| refresh token | expo-secure-store | yes — keychain on iOS |
| access token | memory only | never persisted |
| email bodies | never stored | parsed and discarded |
| transactions | expo-sqlite | no (not sensitive) |

---

## screens to update

**profile screen:**

- add "Gmail" section
- "Connect Gmail" button → triggers oauth flow
- once connected: show "Gmail Connected ✓" + "Disconnect" option
- show last synced time: "last synced 2 hours ago"

**home screen:**

- sync button (already planned) → triggers sync flow
- show syncing indicator while fetching

**add transaction screen:**

- transactions added via gmail sync show a "gmail" badge
- same as subscription "SUB" badge

---

## gmail API scope needed

`https://www.googleapis.com/auth/gmail.readonly`

read-only — app cannot send, delete, or modify any emails.

---

## deduplication strategy

before inserting a synced transaction:

- check if transaction exists with same date + amount + source='axis bank'
- if exists: skip
- if not: insert

this prevents duplicate transactions if sync runs multiple times.

---

## phase 2 tasks in order

1. set up google cloud project + enable gmail API
2. get OAuth client ID for iOS + android
3. install expo-auth-session + expo-secure-store + expo-web-browser
4. implement "Connect Gmail" flow in profile screen
5. collect real axis bank email bodies → write + test regex patterns
6. implement sync function in lib/gmail/sync.ts
7. add sync button to home screen
8. add "gmail" badge to auto-synced transactions
9. test end to end

---

## open questions

- what does your axis bank email body look like? (needed for regex)
- do you want auto-sync on app open or manual sync only?
- how far back should first sync go? (last 30 days, 3 months, all time?)

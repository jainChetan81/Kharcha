# v0.5.1

## Auto Device Registration

- Devices now auto-register with the backend on first launch — no manual setup needed.
- Registration uses a shared `registerDevice()` function with a race guard to prevent duplicate API calls if auto-register and manual register overlap.
- Name banner on home screen prompts users with the default "User" name to set a real name; dismissible with X.
- Name changes (from home banner or profile) sync to backend via `PATCH /device/name`.

## Local SMS Parsers

- Bank SMS/notification parsing now tries local regex parsers first (instant, no network) before falling back to Gemini AI.
- Supported banks: **Axis** (UPI debit/credit, credit card, generic debit/credit), **HDFC** (debit), **IndusInd** (UPI debit/credit, IMPS credit).
- Parse message sheet now shows a helper description and a realistic placeholder example.

## Feature Flags

- New `device_sync_enabled` flag gates the Device Sync section on the profile screen — hidden when disabled.
- Generic `useFlag()` hook replaces per-flag hooks; feature flags refetch every 5 minutes.

## Firebase Observability

- **Crashlytics** — automatic crash reporting with categorized errors (`DB_ERROR`, `API_ERROR`, `SYNC_ERROR`, `UI_ERROR`). All DB query/mutation functions, API calls, Gmail sync, and the React error boundary report to Crashlytics with context.
- **Analytics** — event tracking for core user actions: `transaction_added`, `transaction_deleted`, `transaction_edited`, `subscription_added`, `subscription_toggled`, `gmail_sync_started/completed/failed`, `device_sync_completed`, `export_triggered`, `import_triggered`, `budget_set`. All event names available via `FIREBASE_EVENTS` constant.
- **Performance Monitoring** — traces on `db_init`, `gmail_sync`, `device_sync`, and `cloud_backup` to measure duration of heavy operations.
- **API fetch wrapper** (`apiFetch`) — replaces direct `fetch()` calls to the railway backend. Auto-records server errors to Crashlytics, filters expected statuses (401, 404) to reduce noise.
- All Firebase imports are lazy — no native module crash in dev mode or Expo Go. In `__DEV__`, all functions log to console instead of calling Firebase.
- Crashlytics collection disabled in dev builds, user name attribute set on production launch.
- iOS build fix: config plugin (`plugins/firebase-ios-fix.js`) adds `$RNFirebaseAsStaticFramework` and `use_modular_headers!` to the Podfile.

## Android 3-Button Navigation Fix

- Bottom tab bar on home screen now uses `useSafeAreaInsets()` instead of hardcoded padding — works correctly on gesture nav, 3-button nav, and all iOS devices.
- `BottomSheet` component uses safe area bottom inset — all modals and sheets clear the system nav bar on Android.
- Increased `SCROLL_BOTTOM_PADDING` from 40 to 60 and aligned `history` and `reimbursements` screens to match.

## Other

- Drizzle SQL logger enabled in dev mode (`logger: __DEV__`).
- Added `expo-build-properties` dependency.
- Added `GoogleService-Info.plist` for iOS Firebase config.

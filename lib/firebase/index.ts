export const FIREBASE_EVENTS = {
  TRANSACTION_ADDED: "transaction_added",
  TRANSACTION_DELETED: "transaction_deleted",
  TRANSACTION_EDITED: "transaction_edited",
  SUBSCRIPTION_ADDED: "subscription_added",
  SUBSCRIPTION_TOGGLED: "subscription_toggled",
  GMAIL_CONNECTED: "gmail_connected",
  GMAIL_DISCONNECTED: "gmail_disconnected",
  GMAIL_VERIFIED: "gmail_verified",
  GMAIL_SESSION_EXPIRED: "gmail_session_expired",
  GMAIL_SYNC_STARTED: "gmail_sync_started",
  GMAIL_SYNC_COMPLETED: "gmail_sync_completed",
  GMAIL_SYNC_FAILED: "gmail_sync_failed",
  DEVICE_SYNC_COMPLETED: "device_sync_completed",
  EXPORT_TRIGGERED: "export_triggered",
  IMPORT_TRIGGERED: "import_triggered",
  CLOUD_BACKUP_TOGGLED: "cloud_backup_toggled",
  CLOUD_BACKUP_TRIGGERED: "cloud_backup_triggered",
  CLOUD_BACKUP_RESTORED: "cloud_backup_restored",
  BUDGET_SET: "budget_set",
  SYNC_PREF_TOGGLED: "sync_pref_toggled",
  SMS_LISTENER_GRANT_TAPPED: "sms_listener_grant_tapped",
  INSIGHT_CARD_TAPPED: "insight_card_tapped",
  SPENDING_LENS_CHANGED: "spending_lens_changed",
  SPENDING_VIEW_FULL_BREAKDOWN: "spending_view_full_breakdown",
  HISTORY_INSIGHTS_EXPANDED: "history_insights_expanded",
  FILTER_CHIP_REMOVED: "filter_chip_removed",
  FILTERS_CLEARED_ALL: "filters_cleared_all",
  HOLDING_ADDED: "holding_added",
  HOLDING_CLOSED: "holding_closed",
  HOLDING_REOPENED: "holding_reopened",
  HOLDING_DELETED: "holding_deleted",
  CATEGORY_ADDED: "category_added",
  SOURCE_ADDED: "source_added",
  RECURRING_TRANSACTION_POSTED: "recurring_transaction_posted",
  SIP_POSTED: "sip_posted",
  SIP_SKIPPED_NO_HOLDING: "sip_skipped_no_holding",
  TRANSACTION_RESTORED: "transaction_restored",
} as const;

export type KharchaEvent =
  (typeof FIREBASE_EVENTS)[keyof typeof FIREBASE_EVENTS];

export const ERROR_TYPE = {
  DB: "DB_ERROR",
  API: "API_ERROR",
  SMS_PARSE: "SMS_PARSE_FAILED",
  SYNC: "SYNC_ERROR",
  UI: "UI_ERROR",
} as const;

export type ErrorType = (typeof ERROR_TYPE)[keyof typeof ERROR_TYPE];

export function logFirebaseError(
  error: unknown,
  context: { error_type: ErrorType } & Record<string, string>,
): void {
  if (__DEV__) {
    console.error("[Firebase]", error, context);
    return;
  }
  import("@react-native-firebase/crashlytics")
    .then((mod) => {
      const crash = mod.default();
      for (const [key, value] of Object.entries(context)) {
        crash.setAttribute(key, value);
      }
      const err = error instanceof Error ? error : new Error(String(error));
      crash.recordError(err);
    })
    .catch(() => {});
}

export function logEvent(
  name: KharchaEvent,
  params?: Record<string, string | number>,
): void {
  if (__DEV__) {
    console.log("[Firebase]", name, params);
    return;
  }
  import("@react-native-firebase/analytics")
    .then((mod) => mod.default().logEvent(name, params))
    .catch(() => {});
}

export function logScreenView(pathname: string): void {
  // Collapse numeric path segments (IDs) so dynamic routes like `/edit/123`
  // all roll up to a single "/edit/:id" in analytics instead of fragmenting
  // metrics per transaction.
  const screenName = pathname.replace(/\/\d+/g, "/:id") || "/";
  if (__DEV__) {
    console.log("[Firebase] screen_view", screenName);
    return;
  }
  import("@react-native-firebase/analytics")
    .then((mod) =>
      mod.default().logScreenView({
        screen_name: screenName,
        screen_class: screenName,
      }),
    )
    .catch(() => {});
}

export async function withTrace<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string>,
): Promise<T> {
  if (__DEV__) {
    return fn();
  }
  const stopTrace = await (async () => {
    try {
      const mod = await import("@react-native-firebase/perf");
      const trace = await mod.default().newTrace(name);
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          trace.putAttribute(key, value);
        }
      }
      await trace.start();
      return () => trace.stop();
    } catch {
      return null;
    }
  })();
  if (!stopTrace) return fn();
  try {
    const result = await fn();
    await stopTrace();
    return result;
  } catch (error) {
    await stopTrace();
    throw error;
  }
}

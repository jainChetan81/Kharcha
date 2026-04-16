import crashlytics from "@react-native-firebase/crashlytics";
import perf from "@react-native-firebase/perf";

export const FIREBASE_EVENTS = {
  TRANSACTION_ADDED: "transaction_added",
  TRANSACTION_DELETED: "transaction_deleted",
  TRANSACTION_EDITED: "transaction_edited",
  SUBSCRIPTION_ADDED: "subscription_added",
  SUBSCRIPTION_TOGGLED: "subscription_toggled",
  GMAIL_SYNC_STARTED: "gmail_sync_started",
  GMAIL_SYNC_COMPLETED: "gmail_sync_completed",
  GMAIL_SYNC_FAILED: "gmail_sync_failed",
  DEVICE_SYNC_COMPLETED: "device_sync_completed",
  EXPORT_TRIGGERED: "export_triggered",
  IMPORT_TRIGGERED: "import_triggered",
  BUDGET_SET: "budget_set",
} as const;

export type KharchaEvent =
  (typeof FIREBASE_EVENTS)[keyof typeof FIREBASE_EVENTS];

export function logFirebaseError(
  error: unknown,
  context?: Record<string, string>,
): void {
  if (__DEV__) {
    console.error("[Firebase]", error, context);
    return;
  }
  const err = error instanceof Error ? error : new Error(String(error));
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      crashlytics().setAttribute(key, value);
    }
  }
  crashlytics().recordError(err);
}

export function logEvent(
  name: KharchaEvent,
  params?: Record<string, string | number>,
): void {
  if (__DEV__) {
    console.log("[Firebase]", name, params);
    return;
  }
  // @react-native-firebase/analytics is lazily imported to avoid pulling the
  // module into the JS bundle when it's only needed at event-fire time.
  import("@react-native-firebase/analytics")
    .then((mod) => {
      mod.default().logEvent(name, params);
    })
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
  const trace = await perf().newTrace(name);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      trace.putAttribute(key, value);
    }
  }
  await trace.start();
  try {
    const result = await fn();
    await trace.stop();
    return result;
  } catch (error) {
    await trace.stop();
    throw error;
  }
}

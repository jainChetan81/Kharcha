import SmsNotificationListenerModule from "./SmsNotificationListenerModule";

export type SmsQueueEntry = {
  text: string;
  sender: string;
  package: string;
  received_at: number;
};

export function isNotificationAccessGranted(): boolean {
  return SmsNotificationListenerModule.isNotificationAccessGranted();
}

export function openNotificationAccessSettings(): void {
  SmsNotificationListenerModule.openNotificationAccessSettings();
}

export function setListenerEnabled(enabled: boolean): void {
  SmsNotificationListenerModule.setEnabled(enabled);
}

export function isListenerEnabled(): boolean {
  return SmsNotificationListenerModule.isEnabled();
}

export function readQueue(): SmsQueueEntry[] {
  const raw = SmsNotificationListenerModule.readQueue();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SmsQueueEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearQueue(): void {
  SmsNotificationListenerModule.clearQueue();
}

// Clear only entries with received_at <= cutoffMs. Use this after draining a
// snapshot so notifications that arrived mid-drain are preserved for the
// next pass.
export function clearQueueBefore(cutoffMs: number): void {
  SmsNotificationListenerModule.clearQueueBefore(cutoffMs);
}

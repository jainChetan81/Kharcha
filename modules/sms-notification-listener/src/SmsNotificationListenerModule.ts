import { Platform, requireNativeModule } from "expo-modules-core";

type NativeModule = {
  isNotificationAccessGranted(): boolean;
  openNotificationAccessSettings(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  readQueue(): string;
  clearQueue(): void;
  clearQueueBefore(cutoffMs: number): void;
};

const stub: NativeModule = {
  isNotificationAccessGranted: () => false,
  openNotificationAccessSettings: () => {},
  setEnabled: () => {},
  isEnabled: () => false,
  readQueue: () => "[]",
  clearQueue: () => {},
  clearQueueBefore: () => {},
};

export default Platform.OS === "android"
  ? requireNativeModule<NativeModule>("SmsNotificationListener")
  : stub;

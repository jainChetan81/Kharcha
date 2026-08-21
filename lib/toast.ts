import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";
import Toast from "react-native-toast-message";
import { TOAST_TYPE } from "@/lib/constants";

// Toasts mount transiently and auto-dismiss, so VoiceOver never lands on them
// on its own. Proactively speak the message so blind users get the same
// success/error feedback sighted users see.
function announce(title: string, subtitle?: string) {
  AccessibilityInfo.announceForAccessibility(
    subtitle ? `${title}. ${subtitle}` : title,
  );
}

export function showErrorToast(title: string, cause?: unknown) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  const subtitle = cause ? String(cause) : undefined;
  Toast.show({
    type: TOAST_TYPE.ERROR,
    text1: title,
    text2: subtitle,
  });
  announce(title, subtitle);
}

export function showSuccessToast(title: string, subtitle?: string) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  Toast.show({
    type: TOAST_TYPE.SUCCESS,
    text1: title,
    text2: subtitle,
  });
  announce(title, subtitle);
}

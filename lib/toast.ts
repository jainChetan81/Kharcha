import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";
import { TOAST_TYPE } from "@/lib/constants";

export function showErrorToast(title: string, err?: unknown) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  Toast.show({
    type: TOAST_TYPE.ERROR,
    text1: title,
    text2: err ? String(err) : undefined,
  });
}

export function showSuccessToast(title: string, subtitle?: string) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  Toast.show({
    type: TOAST_TYPE.SUCCESS,
    text1: title,
    text2: subtitle,
  });
}

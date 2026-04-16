import { Alert } from "react-native";

export function showDeleteConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: onConfirm,
    },
  ]);
}

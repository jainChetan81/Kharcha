import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";

export function BottomSheet({
  visible,
  onClose,
  avoidKeyboard = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const content = <View className="rounded-t-2xl bg-card p-6">{children}</View>;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </Modal>
  );
}

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  type KeyboardTypeOptions,
  Modal,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ComponentErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";

type BottomSheetBaseProps = {
  visible: boolean;
  onClose: () => void;
};

type ContentMode = BottomSheetBaseProps & {
  children: React.ReactNode;
  avoidKeyboard?: boolean;
  onSave?: never;
  title?: never;
  placeholder?: never;
  submitLabel?: never;
  defaultValue?: never;
};

type FormMode = BottomSheetBaseProps & {
  children?: never;
  title: string;
  placeholder: string;
  submitLabel: string;
  onSave: (value: string) => Promise<void>;
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
  validate?: (value: string) => boolean;
};

type BottomSheetProps = ContentMode | FormMode;

export function BottomSheet(props: BottomSheetProps) {
  const { visible, onClose } = props;
  const { bottom } = useSafeAreaInsets();
  const isFormMode = !!props.onSave;

  const [value, setValue] = useState(props.defaultValue ?? "");

  // Re-sync internal state to the latest defaultValue each time the sheet
  // opens — without this, reopening the sheet (e.g. renaming a second tag
  // or editing the user name after a prior save) shows stale/empty input
  // because useState only initializes on first mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on open only; ignoring defaultValue avoids clobbering user edits mid-session
  useEffect(() => {
    if (visible) {
      setValue(props.defaultValue ?? "");
    }
  }, [visible]);

  function handleClose() {
    onClose();
  }

  async function handleSave() {
    if (!props.onSave) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    await props.onSave(trimmed);
  }

  const content = (
    <View
      className="rounded-t-2xl bg-card p-6"
      style={{ paddingBottom: Math.max(bottom, 24) }}
    >
      <ComponentErrorBoundary onDismiss={handleClose}>
        {isFormMode ? (
          <>
            <Text className="mb-4 text-base font-bold text-foreground">
              {props.title}
            </Text>
            <Input
              placeholder={props.placeholder}
              value={value}
              onChangeText={(v) => {
                if (
                  props.keyboardType === "numeric" ||
                  props.keyboardType === "decimal-pad"
                ) {
                  setValue(v.replace(/[^0-9.]/g, ""));
                } else {
                  setValue(v);
                }
              }}
              placeholderTextColor={COLORS.MUTED}
              keyboardType={props.keyboardType}
              autoFocus
            />
            <View className="mt-4 flex-row gap-3">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-xl border-border"
                onPress={handleClose}
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Cancel
                </Text>
              </Button>
              <Button
                className="h-12 flex-1 rounded-xl bg-primary"
                onPress={handleSave}
                disabled={
                  !value.trim() ||
                  (props.validate ? !props.validate(value) : false)
                }
              >
                <Text className="text-sm font-semibold text-primary-foreground">
                  {props.submitLabel}
                </Text>
              </Button>
            </View>
          </>
        ) : (
          props.children
        )}
      </ComponentErrorBoundary>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable className="flex-1 bg-black/50" onPress={handleClose} />
      {isFormMode || ("avoidKeyboard" in props && props.avoidKeyboard) ? (
        <KeyboardAvoidingView behavior="padding">
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </Modal>
  );
}

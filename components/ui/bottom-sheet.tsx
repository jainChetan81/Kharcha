import { useState } from "react";
import {
  KeyboardAvoidingView,
  type KeyboardTypeOptions,
  Modal,
  Pressable,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { COLORS } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

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
  const isFormMode = !!props.onSave;

  const [value, setValue] = useState(props.defaultValue ?? "");

  function handleClose() {
    setValue(props.defaultValue ?? "");
    onClose();
  }

  async function handleSave() {
    if (!props.onSave) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    await props.onSave(trimmed);
    setValue("");
  }

  const content = (
    <View className="rounded-t-2xl bg-card p-6">
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
          <View className={cn("mt-4 flex-row gap-3", isIOS && "mb-4")}>
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

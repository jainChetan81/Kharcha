import { BottomSheet } from "@/components/ui/bottom-sheet";

interface EditNameSheetProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onSave: (name: string) => Promise<void>;
}

export default function EditNameSheet({
  visible,
  onClose,
  userName,
  onSave,
}: EditNameSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Edit Name"
      placeholder="Your name"
      submitLabel="Save"
      defaultValue={userName}
      onSave={onSave}
    />
  );
}

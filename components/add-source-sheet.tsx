import { BottomSheet } from "@/components/ui/bottom-sheet";

interface AddSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export default function AddSourceSheet({
  visible,
  onClose,
  onSave,
}: AddSourceSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Add Payment Source"
      placeholder="Source name"
      submitLabel="Add Source"
      onSave={async (name) => {
        await onSave(name);
      }}
    />
  );
}

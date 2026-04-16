import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { Source } from "@/lib/db";

interface AddSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  sources: Source[];
  onSave: (name: string) => Promise<void>;
}

export default function AddSourceSheet({
  visible,
  onClose,
  sources,
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
        const trimmed = name.trim();
        if (
          sources.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
        ) {
          throw new Error(`${trimmed} already exists`);
        }
        await onSave(trimmed);
      }}
    />
  );
}

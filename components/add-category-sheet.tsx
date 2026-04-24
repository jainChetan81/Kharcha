import { BottomSheet } from "@/components/ui/bottom-sheet";

interface AddCategorySheetProps {
  visible: boolean;
  onClose: () => void;
  categoryType: "income" | "expense";
  onSave: (name: string) => Promise<void>;
}

export default function AddCategorySheet({
  visible,
  onClose,
  categoryType,
  onSave,
}: AddCategorySheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Add ${categoryType === "income" ? "Income" : "Expense"} Category`}
      placeholder="Category name"
      submitLabel="Add Category"
      onSave={async (name) => {
        await onSave(name);
      }}
    />
  );
}

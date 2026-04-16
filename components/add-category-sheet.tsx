import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { Category } from "@/lib/db";

interface AddCategorySheetProps {
  visible: boolean;
  onClose: () => void;
  categoryType: "income" | "expense";
  categories: Category[];
  onSave: (name: string) => Promise<void>;
}

export default function AddCategorySheet({
  visible,
  onClose,
  categoryType,
  categories,
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
        const trimmed = name.trim();
        const exists = categories.some(
          (c) =>
            c.type === categoryType &&
            c.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (exists) {
          throw new Error(`${trimmed} already exists`);
        }
        await onSave(trimmed);
      }}
    />
  );
}

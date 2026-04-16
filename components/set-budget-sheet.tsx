import { BottomSheet } from "@/components/ui/bottom-sheet";
import { amountStringSchema } from "@/lib/validation";

interface SetBudgetSheetProps {
  visible: boolean;
  onClose: () => void;
  categoryName: string;
  currentAmount: string;
  onSave: (amount: string) => Promise<void>;
}

export default function SetBudgetSheet({
  visible,
  onClose,
  categoryName,
  currentAmount,
  onSave,
}: SetBudgetSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Set Budget for ${categoryName}`}
      placeholder="Amount"
      submitLabel="Save Budget"
      defaultValue={currentAmount}
      keyboardType="numeric"
      validate={(v) => amountStringSchema.safeParse(v).success}
      onSave={onSave}
    />
  );
}

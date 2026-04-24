import { BottomSheet } from "@/components/ui/bottom-sheet";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

/**
 * Shared sheet for "create new X inline from a picker" flows.
 *
 * Wraps the name → mutation → auto-select round-trip so every inline-create
 * caller (category, source, holding, tag) gets identical UX: the dedup toast
 * distinguishes a fresh insert from "selected existing" so users learn the
 * app silently collapses case-insensitive duplicates.
 */
export function InlineAddSheet({
  visible,
  onClose,
  title,
  placeholder,
  submitLabel,
  mutateAsync,
  onAdded,
  addedToast,
  existingToast,
  errorTitle,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  submitLabel: string;
  mutateAsync: (name: string) => Promise<{ id: number; isNew: boolean }>;
  onAdded: (id: number) => void;
  addedToast: string;
  existingToast: string;
  errorTitle: string;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      placeholder={placeholder}
      submitLabel={submitLabel}
      onSave={async (name) => {
        try {
          const { id, isNew } = await mutateAsync(name);
          onAdded(id);
          onClose();
          showSuccessToast(isNew ? addedToast : existingToast);
        } catch (err) {
          showErrorToast(errorTitle, err);
        }
      }}
    />
  );
}

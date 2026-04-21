import type { UseMutationResult } from "@tanstack/react-query";
import { showDeleteConfirm } from "@/lib/alerts";
import { reorder } from "@/lib/reorder";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type ReorderItem = { id: number; sort_order: number };

type DeleteMutation = UseMutationResult<unknown, Error, number, unknown>;
type ReorderMutation = UseMutationResult<
  unknown,
  Error,
  ReorderItem[],
  unknown
>;

export function useConfigItemActions<T extends { id: number }>({
  items,
  label,
  deleteMutation,
  reorderMutation,
}: {
  items: T[];
  label: string;
  deleteMutation: DeleteMutation;
  reorderMutation: ReorderMutation;
}) {
  function handleDelete(id: number) {
    showDeleteConfirm(
      `Delete ${label}`,
      `This will remove the ${label.toLowerCase()}.`,
      async () => {
        try {
          await deleteMutation.mutateAsync(id);
          showSuccessToast(`${label} deleted`);
        } catch (err) {
          showErrorToast("Failed", err);
        }
      },
    );
  }

  function move(index: number, direction: -1 | 1) {
    const updates = reorder(items, index, direction);
    if (!updates) return;
    reorderMutation.mutate(updates);
  }

  return { handleDelete, move };
}

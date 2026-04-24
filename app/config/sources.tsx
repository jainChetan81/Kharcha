import { lazy, Suspense, useState } from "react";
import { ScrollView, View } from "react-native";
import { ConfigRow } from "@/components/config-row";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { DashedAddButton } from "@/components/ui/dashed-add-button";
import { ScreenDescription } from "@/components/ui/screen-description";
import { ScreenHeader } from "@/components/ui/screen-header";
import { useConfigItemActions } from "@/hooks/use-config-item-actions";
import {
  useAddSource,
  useAllSources,
  useDeleteSource,
  useReorderSources,
} from "@/hooks/use-sources";
import { SCROLL_BOTTOM_PADDING, TOAST_COPY } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddSourceSheet = lazy(() => import("@/components/add-source-sheet"));

export default function SourcesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: sources = [] } = useAllSources();
  const addMutation = useAddSource();
  const deleteMutation = useDeleteSource();
  const reorderMutation = useReorderSources();

  const { handleDelete, move } = useConfigItemActions({
    items: sources,
    label: "Source",
    deleteMutation,
    reorderMutation,
  });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Payment Sources" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <ScreenDescription>
          Cards, bank accounts, and wallets you pay from. The one at the top
          becomes the default for new transactions.
        </ScreenDescription>

        {sources.map((src, index) => (
          <ConfigRow
            key={src.id}
            name={src.name}
            isDefault={src.is_default === 1}
            isFirst={index === 0}
            isLast={index === sources.length - 1}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            onDelete={() => handleDelete(src.id)}
          />
        ))}

        <DashedAddButton label="Add Source" onPress={() => setShowAdd(true)} />
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <AddSourceSheet
            visible={showAdd}
            onClose={() => setShowAdd(false)}
            onSave={async (name) => {
              try {
                const { isNew } = await addMutation.mutateAsync(name);
                setShowAdd(false);
                showSuccessToast(
                  isNew ? "Source added" : TOAST_COPY.ALREADY_EXISTS,
                );
              } catch (err) {
                if (err instanceof Error) {
                  showErrorToast("Failed", err.message);
                } else {
                  showErrorToast("Failed", "Could not add source");
                }
              }
            }}
          />
        </ComponentErrorBoundary>
      </Suspense>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

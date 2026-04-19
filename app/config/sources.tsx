import { Plus } from "lucide-react-native";
import { lazy, Suspense, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ConfigRow } from "@/components/config-row";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import {
  useAddSource,
  useAllSources,
  useDeleteSource,
  useReorderSources,
} from "@/hooks/use-sources";
import { showDeleteConfirm } from "@/lib/alerts";
import { SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { reorder } from "@/lib/reorder";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddSourceSheet = lazy(() => import("@/components/add-source-sheet"));

export default function SourcesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: sources = [] } = useAllSources();
  const addMutation = useAddSource();
  const deleteMutation = useDeleteSource();
  const reorderMutation = useReorderSources();

  function handleDelete(id: number) {
    showDeleteConfirm(
      "Delete Source",
      "This will remove the source.",
      async () => {
        try {
          await deleteMutation.mutateAsync(id);
          showSuccessToast("Source deleted");
        } catch (err) {
          showErrorToast("Failed", err);
        }
      },
    );
  }

  function move(index: number, direction: -1 | 1) {
    const updates = reorder(sources, index, direction);
    if (!updates) return;
    reorderMutation.mutate(updates);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Payment Sources" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Cards, bank accounts, and wallets you pay from. The one at the top
          becomes the default for new transactions.
        </Text>

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

        <Pressable
          onPress={() => setShowAdd(true)}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">Add Source</Text>
        </Pressable>
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <AddSourceSheet
            visible={showAdd}
            onClose={() => setShowAdd(false)}
            sources={sources}
            onSave={async (name) => {
              try {
                await addMutation.mutateAsync(name);
                setShowAdd(false);
                showSuccessToast("Source added");
              } catch (err) {
                if (err instanceof Error) {
                  showErrorToast("Duplicate", err.message);
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

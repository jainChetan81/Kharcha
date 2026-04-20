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
  useAddCategory,
  useAllCategories,
  useDeleteCategory,
  useReorderCategories,
} from "@/hooks/use-categories";
import { showDeleteConfirm } from "@/lib/alerts";
import { SCROLL_BOTTOM_PADDING, TRANSACTION_TYPE } from "@/lib/constants";
import { reorder } from "@/lib/reorder";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddCategorySheet = lazy(() => import("@/components/add-category-sheet"));

export default function IncomeCategoriesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: categories = [] } = useAllCategories();
  const addMutation = useAddCategory();
  const deleteMutation = useDeleteCategory();
  const reorderMutation = useReorderCategories();

  const list = categories.filter((c) => c.type === TRANSACTION_TYPE.INCOME);

  function handleDelete(id: number) {
    showDeleteConfirm(
      "Delete Category",
      "This will remove the category.",
      async () => {
        try {
          await deleteMutation.mutateAsync(id);
          showSuccessToast("Category deleted");
        } catch (err) {
          showErrorToast("Failed", err);
        }
      },
    );
  }

  function move(index: number, direction: -1 | 1) {
    const updates = reorder(list, index, direction);
    if (!updates) return;
    reorderMutation.mutate(updates);
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Income Categories" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Buckets you tag incoming money against — salary, refunds, gifts.
          Reorder to control picker order.
        </Text>

        {list.map((cat, index) => (
          <ConfigRow
            key={cat.id}
            name={cat.name}
            isDefault={cat.is_default === 1}
            isFirst={index === 0}
            isLast={index === list.length - 1}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            onDelete={() => handleDelete(cat.id)}
          />
        ))}

        <Pressable
          onPress={() => setShowAdd(true)}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">
            Add Income Category
          </Text>
        </Pressable>
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <AddCategorySheet
            visible={showAdd}
            onClose={() => setShowAdd(false)}
            categoryType={TRANSACTION_TYPE.INCOME}
            categories={categories}
            onSave={async (name) => {
              try {
                await addMutation.mutateAsync({
                  name,
                  type: TRANSACTION_TYPE.INCOME,
                });
                setShowAdd(false);
                showSuccessToast("Category added");
              } catch (err) {
                if (err instanceof Error) {
                  showErrorToast("Duplicate", err.message);
                } else {
                  showErrorToast("Failed", "Could not add category");
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

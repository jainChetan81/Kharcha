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
import {
  useAddCategory,
  useAllCategories,
  useDeleteCategory,
  useReorderCategories,
} from "@/hooks/use-categories";
import { useConfigItemActions } from "@/hooks/use-config-item-actions";
import {
  SCROLL_BOTTOM_PADDING,
  TOAST_COPY,
  TRANSACTION_TYPE,
} from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const AddCategorySheet = lazy(() => import("@/components/add-category-sheet"));

export default function IncomeCategoriesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: categories = [] } = useAllCategories();
  const addMutation = useAddCategory();
  const deleteMutation = useDeleteCategory();
  const reorderMutation = useReorderCategories();

  const list = categories.filter((c) => c.type === TRANSACTION_TYPE.INCOME);

  const { handleDelete, move } = useConfigItemActions({
    items: list,
    label: "Category",
    deleteMutation,
    reorderMutation,
  });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Income Categories" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <ScreenDescription>
          Buckets you tag incoming money against — salary, refunds, gifts.
          Reorder to control picker order.
        </ScreenDescription>

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

        <DashedAddButton
          label="Add Income Category"
          onPress={() => setShowAdd(true)}
        />
      </ScrollView>

      <Suspense fallback={null}>
        <ComponentErrorBoundary>
          <AddCategorySheet
            visible={showAdd}
            onClose={() => setShowAdd(false)}
            categoryType={TRANSACTION_TYPE.INCOME}
            onSave={async (name) => {
              try {
                const { isNew } = await addMutation.mutateAsync({
                  name,
                  type: TRANSACTION_TYPE.INCOME,
                });
                setShowAdd(false);
                showSuccessToast(
                  isNew ? "Category added" : TOAST_COPY.ALREADY_EXISTS,
                );
              } catch (err) {
                if (err instanceof Error) {
                  showErrorToast("Failed", err.message);
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

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ConfigRow } from "@/components/config-row";
import { ScreenError } from "@/components/error-boundary";
import { DashedAddButton } from "@/components/ui/dashed-add-button";
import { InlineAddSheet } from "@/components/ui/inline-add-sheet";
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

      <InlineAddSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Income Category"
        placeholder="Category name"
        submitLabel="Add Category"
        mutateAsync={(name) =>
          addMutation.mutateAsync({ name, type: TRANSACTION_TYPE.INCOME })
        }
        onAdded={() => {}}
        addedToast="Category added"
        existingToast={TOAST_COPY.ALREADY_EXISTS}
        errorTitle="Failed"
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

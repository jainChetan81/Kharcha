import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ConfigRow } from "@/components/config-row";
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
  CATEGORY_LIST_COPY,
  SCROLL_BOTTOM_PADDING,
  TOAST_COPY,
  type TRANSACTION_TYPE,
} from "@/lib/constants";

export function CategoryListScreen({
  type,
}: {
  type: typeof TRANSACTION_TYPE.EXPENSE | typeof TRANSACTION_TYPE.INCOME;
}) {
  const copy = CATEGORY_LIST_COPY[type];
  const [showAdd, setShowAdd] = useState(false);
  const { data: categories = [] } = useAllCategories();
  const addMutation = useAddCategory();
  const deleteMutation = useDeleteCategory();
  const reorderMutation = useReorderCategories();

  const list = categories.filter((c) => c.type === type);

  const { handleDelete, move } = useConfigItemActions({
    items: list,
    label: "Category",
    deleteMutation,
    reorderMutation,
  });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={copy.headerTitle} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <ScreenDescription>{copy.description}</ScreenDescription>

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
          label={copy.addLabel}
          onPress={() => setShowAdd(true)}
        />
      </ScrollView>

      <InlineAddSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title={copy.addLabel}
        placeholder="Category name"
        submitLabel="Add Category"
        mutateAsync={(name) => addMutation.mutateAsync({ name, type })}
        onAdded={() => {}}
        addedToast="Category added"
        existingToast={TOAST_COPY.ALREADY_EXISTS}
        errorTitle="Failed"
      />
    </View>
  );
}

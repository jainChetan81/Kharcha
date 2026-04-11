import { GripVertical, Lock, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import {
  useAddCategory,
  useAllCategories,
  useDeleteCategory,
  useReorderCategories,
} from "@/hooks/use-categories";
import {
  useAddSource,
  useAllSources,
  useDeleteSource,
  useReorderSources,
} from "@/hooks/use-sources";
import { COLORS, TRANSACTION_TYPE } from "@/lib/constants";
import type { Category, Source } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

function CategoryRow({
  item,
  drag,
  isActive,
  onDelete,
}: RenderItemParams<Category> & { onDelete: (id: number) => void }) {
  return (
    <ScaleDecorator activeScale={1.02}>
      <Pressable
        onLongPress={drag}
        disabled={isActive}
        className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
      >
        <Icon
          as={GripVertical}
          size={16}
          color={COLORS.MUTED}
          className="mr-3"
        />
        <Text className="flex-1 text-sm font-medium capitalize text-foreground">
          {item.name}
        </Text>
        {item.is_default === 1 ? (
          <Icon as={Lock} className="size-4 text-muted-foreground" />
        ) : (
          <Pressable onPress={() => onDelete(item.id)}>
            <Icon as={Trash2} className="size-4 text-negative" />
          </Pressable>
        )}
      </Pressable>
    </ScaleDecorator>
  );
}

function SourceRow({
  item,
  drag,
  isActive,
  onDelete,
}: RenderItemParams<Source> & { onDelete: (id: number) => void }) {
  return (
    <ScaleDecorator activeScale={1.02}>
      <Pressable
        onLongPress={drag}
        disabled={isActive}
        className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
      >
        <Icon
          as={GripVertical}
          size={16}
          color={COLORS.MUTED}
          className="mr-3"
        />
        <Text className="flex-1 text-sm font-medium capitalize text-foreground">
          {item.name}
        </Text>
        {item.is_default === 1 ? (
          <Icon as={Lock} className="size-4 text-muted-foreground" />
        ) : (
          <Pressable onPress={() => onDelete(item.id)}>
            <Icon as={Trash2} className="size-4 text-negative" />
          </Pressable>
        )}
      </Pressable>
    </ScaleDecorator>
  );
}

export default function ConfigScreen() {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">(
    TRANSACTION_TYPE.EXPENSE,
  );

  const { data: categories = [] } = useAllCategories();
  const { data: sources = [] } = useAllSources();

  const addCategoryMutation = useAddCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const reorderCategoriesMutation = useReorderCategories();
  const addSourceMutation = useAddSource();
  const deleteSourceMutation = useDeleteSource();
  const reorderSourcesMutation = useReorderSources();

  const expenseCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.EXPENSE,
  );
  const incomeCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.INCOME,
  );

  function handleDeleteCategory(id: number) {
    Alert.alert("Delete Category", "This will remove the category.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCategoryMutation.mutateAsync(id);
            showSuccessToast("Category deleted");
          } catch (err) {
            showErrorToast("Failed", err);
          }
        },
      },
    ]);
  }

  function handleDeleteSource(id: number) {
    Alert.alert("Delete Source", "This will remove the source.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSourceMutation.mutateAsync(id);
            showSuccessToast("Source deleted");
          } catch (err) {
            showErrorToast("Failed", err);
          }
        },
      },
    ]);
  }

  function renderExpenseCategory(params: RenderItemParams<Category>) {
    return <CategoryRow {...params} onDelete={handleDeleteCategory} />;
  }

  function renderIncomeCategory(params: RenderItemParams<Category>) {
    return <CategoryRow {...params} onDelete={handleDeleteCategory} />;
  }

  function renderSource(params: RenderItemParams<Source>) {
    return <SourceRow {...params} onDelete={handleDeleteSource} />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Config" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <SectionHeader title="Expense Categories" />
        <DraggableFlatList<Category>
          data={expenseCategories}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderExpenseCategory}
          onDragEnd={({ data }) => {
            reorderCategoriesMutation.mutate(
              data.map((item, index) => ({ id: item.id, sort_order: index })),
            );
          }}
          scrollEnabled={false}
        />
        <Pressable
          onPress={() => {
            setNewCategoryType(TRANSACTION_TYPE.EXPENSE);
            setShowAddCategory(true);
          }}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">
            Add Expense Category
          </Text>
        </Pressable>

        <SectionHeader title="Income Categories" />
        <DraggableFlatList<Category>
          data={incomeCategories}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderIncomeCategory}
          onDragEnd={({ data }) => {
            reorderCategoriesMutation.mutate(
              data.map((item, index) => ({ id: item.id, sort_order: index })),
            );
          }}
          scrollEnabled={false}
        />
        <Pressable
          onPress={() => {
            setNewCategoryType(TRANSACTION_TYPE.INCOME);
            setShowAddCategory(true);
          }}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">
            Add Income Category
          </Text>
        </Pressable>

        <SectionHeader title="Payment Sources" />
        <DraggableFlatList<Source>
          data={sources}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSource}
          onDragEnd={({ data }) => {
            reorderSourcesMutation.mutate(
              data.map((item, index) => ({ id: item.id, sort_order: index })),
            );
          }}
          scrollEnabled={false}
        />
        <Pressable
          onPress={() => setShowAddSource(true)}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">Add Source</Text>
        </Pressable>
      </ScrollView>

      <BottomSheet
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        title={`Add ${newCategoryType === TRANSACTION_TYPE.INCOME ? "Income" : "Expense"} Category`}
        placeholder="Category name"
        submitLabel="Add Category"
        onSave={async (name) => {
          const trimmed = name.trim();
          const exists = categories.some(
            (c) =>
              c.type === newCategoryType &&
              c.name.toLowerCase() === trimmed.toLowerCase(),
          );
          if (exists) {
            showErrorToast("Duplicate", `${trimmed} already exists`);
            return;
          }
          await addCategoryMutation.mutateAsync({
            name: trimmed,
            type: newCategoryType,
          });
          setShowAddCategory(false);
          showSuccessToast("Category added");
        }}
      />

      <BottomSheet
        visible={showAddSource}
        onClose={() => setShowAddSource(false)}
        title="Add Payment Source"
        placeholder="Source name"
        submitLabel="Add Source"
        onSave={async (name) => {
          const trimmed = name.trim();
          if (
            sources.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
          ) {
            showErrorToast("Duplicate", `${trimmed} already exists`);
            return;
          }
          await addSourceMutation.mutateAsync(trimmed);
          setShowAddSource(false);
          showSuccessToast("Source added");
        }}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

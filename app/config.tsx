import {
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
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
import { TRANSACTION_TYPE } from "@/lib/constants";
import type { Category, Source } from "@/lib/db";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ReorderItem = { id: number; sort_order: number };

function reorder<T extends { id: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): ReorderItem[] | null {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = items.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next.map((item, i) => ({ id: item.id, sort_order: i }));
}

function Row({
  name,
  isDefault,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  name: string;
  isDefault: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-3 py-2">
      <Pressable
        onPress={onMoveUp}
        disabled={isFirst}
        hitSlop={6}
        className={cn("p-1.5", isFirst && "opacity-30")}
      >
        <Icon as={ChevronUp} className="size-4 text-muted-foreground" />
      </Pressable>
      <Pressable
        onPress={onMoveDown}
        disabled={isLast}
        hitSlop={6}
        className={cn("p-1.5", isLast && "opacity-30")}
      >
        <Icon as={ChevronDown} className="size-4 text-muted-foreground" />
      </Pressable>
      <Text className="ml-2 flex-1 text-sm font-medium capitalize text-foreground">
        {name}
      </Text>
      {isDefault ? (
        <Icon as={Lock} className="size-4 text-muted-foreground" />
      ) : (
        <Pressable onPress={onDelete} hitSlop={8} className="p-1">
          <Icon as={Trash2} className="size-4 text-negative" />
        </Pressable>
      )}
    </View>
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

  function moveCategory(
    list: Category[],
    index: number,
    direction: -1 | 1,
  ) {
    const updates = reorder(list, index, direction);
    if (!updates) return;
    reorderCategoriesMutation.mutate(updates);
  }

  function moveSource(index: number, direction: -1 | 1) {
    const updates = reorder(sources, index, direction);
    if (!updates) return;
    reorderSourcesMutation.mutate(updates);
  }

  function renderCategoryRows(list: Category[]) {
    return list.map((cat, index) => (
      <Row
        key={cat.id}
        name={cat.name}
        isDefault={cat.is_default === 1}
        isFirst={index === 0}
        isLast={index === list.length - 1}
        onMoveUp={() => moveCategory(list, index, -1)}
        onMoveDown={() => moveCategory(list, index, 1)}
        onDelete={() => handleDeleteCategory(cat.id)}
      />
    ));
  }

  function renderSourceRows(list: Source[]) {
    return list.map((src, index) => (
      <Row
        key={src.id}
        name={src.name}
        isDefault={src.is_default === 1}
        isFirst={index === 0}
        isLast={index === list.length - 1}
        onMoveUp={() => moveSource(index, -1)}
        onMoveDown={() => moveSource(index, 1)}
        onDelete={() => handleDeleteSource(src.id)}
      />
    ));
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Config" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <SectionHeader title="Expense Categories" />
        {renderCategoryRows(expenseCategories)}
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
        {renderCategoryRows(incomeCategories)}
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
        {renderSourceRows(sources)}
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

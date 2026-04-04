import { Lock, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { AddItemSheet } from "@/components/add-item-sheet";
import { ScreenError } from "@/components/error-boundary";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import {
  useAddCategory,
  useAllCategories,
  useDeleteCategory,
} from "@/hooks/use-categories";
import {
  useAddSource,
  useAllSources,
  useDeleteSource,
} from "@/hooks/use-sources";
import { TRANSACTION_TYPE } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

function ConfigRow({
  label,
  badge,
  isDefault,
  onDelete,
}: {
  label: string;
  badge?: string;
  isDefault: boolean;
  onDelete: () => void;
}) {
  return (
    <View className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3">
      <Text className="flex-1 text-sm font-medium capitalize text-foreground">
        {label}
      </Text>
      {badge && (
        <View className="mr-3 rounded-full bg-muted px-2 py-0.5">
          <Text className="text-[10px] font-medium capitalize text-muted-foreground">
            {badge}
          </Text>
        </View>
      )}
      {isDefault ? (
        <Icon as={Lock} className="size-4 text-muted-foreground" />
      ) : (
        <Pressable onPress={onDelete}>
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
  const addSourceMutation = useAddSource();
  const deleteSourceMutation = useDeleteSource();
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

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Config" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <SectionHeader title="Expense Categories" />
        {expenseCategories.map((c) => (
          <ConfigRow
            key={c.id}
            label={c.name}
            isDefault={c.is_default === 1}
            onDelete={() => handleDeleteCategory(c.id)}
          />
        ))}
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
        {incomeCategories.map((c) => (
          <ConfigRow
            key={c.id}
            label={c.name}
            isDefault={c.is_default === 1}
            onDelete={() => handleDeleteCategory(c.id)}
          />
        ))}
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
        {sources.map((s) => (
          <ConfigRow
            key={s.id}
            label={s.name}
            isDefault={s.is_default === 1}
            onDelete={() => handleDeleteSource(s.id)}
          />
        ))}
        <Pressable
          onPress={() => setShowAddSource(true)}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">Add Source</Text>
        </Pressable>
      </ScrollView>

      <AddItemSheet
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        title={`Add ${newCategoryType === TRANSACTION_TYPE.INCOME ? "Income" : "Expense"} Category`}
        placeholder="Category name"
        submitLabel="Add Category"
        onAdd={async (name) => {
          await addCategoryMutation.mutateAsync({
            name,
            type: newCategoryType,
          });
          setShowAddCategory(false);
          showSuccessToast("Category added");
        }}
      />

      <AddItemSheet
        visible={showAddSource}
        onClose={() => setShowAddSource(false)}
        title="Add Payment Source"
        placeholder="Source name"
        submitLabel="Add Source"
        onAdd={async (name) => {
          await addSourceMutation.mutateAsync(name);
          setShowAddSource(false);
          showSuccessToast("Source added");
        }}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

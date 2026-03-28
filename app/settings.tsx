import Constants from "expo-constants";
import { router } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { ScreenError } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
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
import { useClearAllTransactions } from "@/hooks/use-transactions";
import { SCREENS, TOAST_TYPE, TRANSACTION_TYPE } from "@/lib/constants";
import { cn, isIOS } from "@/lib/utils";

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </Text>
  );
}

function ListItem({
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

export default function SettingsScreen() {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">(
    TRANSACTION_TYPE.EXPENSE,
  );
  const [newSourceName, setNewSourceName] = useState("");

  const { data: categories = [] } = useAllCategories();
  const { data: sources = [] } = useAllSources();

  const addCategoryMutation = useAddCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const addSourceMutation = useAddSource();
  const deleteSourceMutation = useDeleteSource();
  const clearTransactionsMutation = useClearAllTransactions();

  const expenseCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.EXPENSE,
  );
  const incomeCategories = categories.filter(
    (c) => c.type === TRANSACTION_TYPE.INCOME,
  );

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await addCategoryMutation.mutateAsync({ name, type: newCategoryType });
      setNewCategoryName("");
      setShowAddCategory(false);
      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Category added" });
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed",
        text2: String(err),
      });
    }
  }

  function handleDeleteCategory(id: number) {
    Alert.alert("Delete Category", "This will remove the category.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCategoryMutation.mutateAsync(id);
            Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Category deleted" });
          } catch (err) {
            Toast.show({
              type: TOAST_TYPE.ERROR,
              text1: "Failed",
              text2: String(err),
            });
          }
        },
      },
    ]);
  }

  async function handleAddSource() {
    const name = newSourceName.trim();
    if (!name) return;
    try {
      await addSourceMutation.mutateAsync(name);
      setNewSourceName("");
      setShowAddSource(false);
      Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Source added" });
    } catch (err) {
      Toast.show({
        type: TOAST_TYPE.ERROR,
        text1: "Failed",
        text2: String(err),
      });
    }
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
            Toast.show({ type: TOAST_TYPE.SUCCESS, text1: "Source deleted" });
          } catch (err) {
            Toast.show({
              type: TOAST_TYPE.ERROR,
              text1: "Failed",
              text2: String(err),
            });
          }
        },
      },
    ]);
  }

  function handleClearTransactions() {
    Alert.alert(
      "Clear All Transactions",
      "This will permanently delete all your transactions. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearTransactionsMutation.mutateAsync();
              Toast.show({
                type: TOAST_TYPE.SUCCESS,
                text1: "All transactions deleted",
              });
            } catch (err) {
              Toast.show({
                type: TOAST_TYPE.ERROR,
                text1: "Failed",
                text2: String(err),
              });
            }
          },
        },
      ],
    );
  }

  const appVersion =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.expoClient?.version ??
    "1.0.0";

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className={cn(
          "flex-row items-center bg-background px-6 pb-4",
          isIOS ? "pt-[60px]" : "pt-12",
        )}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center py-1"
        >
          <Icon as={ChevronLeft} className="mr-1 size-6 text-foreground" />
          <Text className="text-lg font-bold text-foreground">Settings</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Expense Categories */}
        <SectionHeader title="Expense Categories" />
        {expenseCategories.map((c) => (
          <ListItem
            key={c.id}
            label={c.name}
            isDefault={c.is_default === 1}
            onDelete={() => handleDeleteCategory(c.id)}
          />
        ))}
        <Pressable
          onPress={() => {
            setNewCategoryType(TRANSACTION_TYPE.EXPENSE);
            setNewCategoryName("");
            setShowAddCategory(true);
          }}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">
            Add Expense Category
          </Text>
        </Pressable>

        {/* Income Categories */}
        <SectionHeader title="Income Categories" />
        {incomeCategories.map((c) => (
          <ListItem
            key={c.id}
            label={c.name}
            isDefault={c.is_default === 1}
            onDelete={() => handleDeleteCategory(c.id)}
          />
        ))}
        <Pressable
          onPress={() => {
            setNewCategoryType(TRANSACTION_TYPE.INCOME);
            setNewCategoryName("");
            setShowAddCategory(true);
          }}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">
            Add Income Category
          </Text>
        </Pressable>

        {/* Sources */}
        <SectionHeader title="Payment Sources" />
        {sources.map((s) => (
          <ListItem
            key={s.id}
            label={s.name}
            isDefault={s.is_default === 1}
            onDelete={() => handleDeleteSource(s.id)}
          />
        ))}
        <Pressable
          onPress={() => {
            setNewSourceName("");
            setShowAddSource(true);
          }}
          className="mx-5 mt-2 flex-row items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3"
        >
          <Icon as={Plus} className="size-4 text-primary" />
          <Text className="text-sm font-medium text-primary">Add Source</Text>
        </Pressable>

        {/* Data */}
        <SectionHeader title="Data" />
        <Pressable
          onPress={handleClearTransactions}
          className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-negative">
            Clear All Transactions
          </Text>
          <Icon as={Trash2} className="size-4 text-negative" />
        </Pressable>
        <Pressable
          onPress={() => router.push(SCREENS.ABOUT)}
          className="mx-5 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="flex-1 text-sm font-medium text-foreground">
            About
          </Text>
          <Text className="mr-2 text-sm text-muted-foreground">
            v{appVersion}
          </Text>
          <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
        </Pressable>
      </ScrollView>

      {/* Add Category Modal */}
      <Modal
        visible={showAddCategory}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddCategory(false)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setShowAddCategory(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="rounded-t-2xl bg-card p-6">
            <Text className="mb-4 text-base font-bold text-foreground">
              Add{" "}
              {newCategoryType === TRANSACTION_TYPE.INCOME
                ? "Income"
                : "Expense"}{" "}
              Category
            </Text>
            <Input
              placeholder="Category name"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholderTextColor="#888888"
              autoFocus
            />
            <Button
              className="mt-4 h-14 rounded-2xl bg-primary"
              onPress={handleAddCategory}
              disabled={!newCategoryName.trim()}
            >
              <Text className="text-base font-semibold text-primary-foreground">
                Add Category
              </Text>
            </Button>
            <Pressable
              onPress={() => setShowAddCategory(false)}
              className={cn("mt-3 items-center py-2", isIOS && "mb-4")}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Source Modal */}
      <Modal
        visible={showAddSource}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddSource(false)}
      >
        <Pressable
          className="flex-1 bg-black/50"
          onPress={() => setShowAddSource(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="rounded-t-2xl bg-card p-6">
            <Text className="mb-4 text-base font-bold text-foreground">
              Add Payment Source
            </Text>
            <Input
              placeholder="Source name"
              value={newSourceName}
              onChangeText={setNewSourceName}
              placeholderTextColor="#888888"
              autoFocus
            />
            <Button
              className="mt-4 h-14 rounded-2xl bg-primary"
              onPress={handleAddSource}
              disabled={!newSourceName.trim()}
            >
              <Text className="text-base font-semibold text-primary-foreground">
                Add Source
              </Text>
            </Button>
            <Pressable
              onPress={() => setShowAddSource(false)}
              className={cn("mt-3 items-center py-2", isIOS && "mb-4")}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

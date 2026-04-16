import { Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ScreenError } from "@/components/error-boundary";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import {
  useAddTag,
  useAllTags,
  useAllTimeTagBreakdown,
  useDeleteTag,
  useRenameTag,
} from "@/hooks/use-tags";
import { showDeleteConfirm } from "@/lib/alerts";
import { SCROLL_BOTTOM_PADDING } from "@/lib/constants";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type EditTarget = { id: number; name: string } | null;

export default function TagsScreen() {
  const { format: fmt } = useCurrency();
  const { data: tags = [] } = useAllTags();
  const { data: breakdown = [] } = useAllTimeTagBreakdown();
  const addMutation = useAddTag();
  const renameMutation = useRenameTag();
  const deleteMutation = useDeleteTag();

  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  const statsByTag = new Map(breakdown.map((b) => [b.tag_id, b]));

  function handleDelete(id: number, name: string) {
    showDeleteConfirm(
      `Delete #${name}?`,
      "The tag will be removed from all transactions. The transactions themselves stay.",
      async () => {
        try {
          await deleteMutation.mutateAsync(id);
          showSuccessToast("Tag deleted");
        } catch (err) {
          showErrorToast("Failed to delete", err);
        }
      },
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Tags">
        <Pressable
          onPress={() => setAddSheetVisible(true)}
          className="flex-row items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2"
        >
          <Icon as={Plus} className="size-4 text-muted-foreground" />
          <Text className="text-xs font-medium text-muted-foreground">
            New Tag
          </Text>
        </Pressable>
      </ScreenHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={SCROLL_BOTTOM_PADDING}
      >
        <Text className="px-5 pb-3 text-xs text-muted-foreground">
          Use tags to group spend across categories — trips, events, shared
          expenses. Each transaction can have multiple tags.
        </Text>

        {tags.length === 0 ? (
          <View className="mx-5 mt-6 items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10">
            <Icon as={TagIcon} className="mb-3 size-10 text-muted-foreground" />
            <Text className="text-center text-sm font-medium text-foreground">
              No tags yet
            </Text>
            <Text className="mt-1 text-center text-xs text-muted-foreground">
              Add your first tag to start slicing your spending
            </Text>
          </View>
        ) : (
          tags.map((tag) => {
            const stat = statsByTag.get(tag.id);
            return (
              <View
                key={tag.id}
                className="mx-5 mb-2 flex-row items-center rounded-xl border border-border bg-card px-4 py-3"
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground">
                    #{tag.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {stat
                      ? `${stat.count} tx · ${fmt(stat.total)}`
                      : "Not used yet"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setEditTarget({ id: tag.id, name: tag.name })}
                  className="ml-3 p-1"
                  hitSlop={8}
                >
                  <Icon as={Pencil} className="size-4 text-muted-foreground" />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(tag.id, tag.name)}
                  className="ml-3 p-1"
                  hitSlop={8}
                >
                  <Icon as={Trash2} className="size-4 text-negative" />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <BottomSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        title="New Tag"
        placeholder="e.g. goa-trip, birthday, wfh"
        submitLabel="Add Tag"
        onSave={async (name) => {
          try {
            const { isNew } = await addMutation.mutateAsync(name);
            setAddSheetVisible(false);
            showSuccessToast(isNew ? "Tag added" : "Tag already exists");
          } catch (err) {
            showErrorToast("Failed to add tag", err);
          }
        }}
      />

      <BottomSheet
        visible={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Rename Tag"
        placeholder="Tag name"
        submitLabel="Save"
        defaultValue={editTarget?.name ?? ""}
        onSave={async (name) => {
          if (!editTarget) return;
          try {
            await renameMutation.mutateAsync({ id: editTarget.id, name });
            setEditTarget(null);
            showSuccessToast("Tag updated");
          } catch (err) {
            showErrorToast("Failed to update", err);
          }
        }}
      />
    </View>
  );
}

export const ErrorBoundary = ScreenError;

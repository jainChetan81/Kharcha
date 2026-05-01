import { format } from "date-fns";
import { router } from "expo-router";
import {
  Calendar,
  Palette,
  Pencil,
  Plus,
  Square,
  Tag as TagIcon,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ComponentErrorBoundary,
  ScreenError,
} from "@/components/error-boundary";
import {
  durationEnd,
  QuickDurationSheet,
} from "@/components/quick-duration-sheet";
import { TagAppearanceSheet } from "@/components/tag-appearance-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StepCard } from "@/components/ui/step-card";
import { TagChip } from "@/components/ui/tag-chip";
import { Text } from "@/components/ui/text";
import { useCurrency } from "@/hooks/use-currency";
import { useTagSheets } from "@/hooks/use-tag-sheets";
import {
  useActiveTag,
  useAddTag,
  useAllTags,
  useAllTimeTagBreakdown,
  useDeleteTag,
  useEndScheduleNow,
  useRenameTag,
  useScheduleTag,
  useUpdateTagAppearance,
} from "@/hooks/use-tags";
import { showDeleteConfirm } from "@/lib/alerts";
import {
  DATE_TIME_FORMAT,
  SCROLL_BOTTOM_PADDING,
  TAG_SCOPE_COPY,
  tagScreen,
} from "@/lib/constants";
import type { Tag } from "@/lib/db/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type EditTarget = { id: number; name: string } | null;

export default function TagsScreen() {
  const { format: fmt } = useCurrency();
  const { data: tags = [] } = useAllTags();
  const { data: breakdown = [] } = useAllTimeTagBreakdown();
  const { data: activeTag } = useActiveTag();
  const addMutation = useAddTag();
  const renameMutation = useRenameTag();
  const deleteMutation = useDeleteTag();
  const endNowMutation = useEndScheduleNow();
  const scheduleMutation = useScheduleTag();
  const appearanceMutation = useUpdateTagAppearance();
  const { openQuickStart, openSchedule, sheets: tagSheets } = useTagSheets();

  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [quickDurationTarget, setQuickDurationTarget] = useState<string | null>(
    null,
  );
  const [appearanceTarget, setAppearanceTarget] = useState<Tag | null>(null);

  const statsByTag = new Map(breakdown.map((b) => [b.tag_id, b]));
  const hasTags = tags.length > 0;

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
        <Text className="px-5 pb-3 pt-2 text-xs text-muted-foreground">
          Tags group spend across categories — trips, events, shared expenses.
          Schedule a tag (start + end) to scope new transactions inside that
          window — office hours, a wedding, a trip.
        </Text>

        {activeTag ? (
          <Pressable
            onPress={() => router.push(tagScreen(activeTag.id))}
            className="mx-5 mb-2 rounded-2xl border border-primary/40 bg-primary/10 p-4"
          >
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Currently active
            </Text>
            <Text className="mt-1 text-base font-bold text-foreground">
              #{activeTag.name}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              Tap to view stats →
            </Text>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                if (!activeTag.start_date) return;
                endNowMutation.mutate({
                  id: activeTag.id,
                  name: activeTag.name,
                  startAt: activeTag.start_date,
                });
              }}
              disabled={endNowMutation.isPending}
              className="mt-3 self-start rounded-xl border border-border bg-card px-3 py-2"
            >
              <Text className="text-xs font-medium text-foreground">
                End now
              </Text>
            </Pressable>
          </Pressable>
        ) : hasTags ? (
          <Pressable
            onPress={() => openQuickStart()}
            className="mx-5 mb-2 flex-row items-center gap-3 rounded-2xl bg-primary px-4 py-3.5"
          >
            <Icon as={Zap} className="size-4 text-primary-foreground" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-primary-foreground">
                Start a scope now
              </Text>
              <Text className="mt-0.5 text-xs text-primary-foreground/80">
                Pick a name and duration. Auto-tagging starts now.
              </Text>
            </View>
          </Pressable>
        ) : null}

        <SectionHeader
          title="How scopes work"
          description="Start one now, or schedule it ahead."
        />
        <View className="mx-5 mb-2 flex-row gap-3">
          <StepCard
            step="1"
            title="Pick a window"
            body="Start now for a few hours, or schedule a future date range."
          />
          <StepCard
            step="2"
            title="Auto-tag"
            body="Every transaction in the window gets the tag."
          />
        </View>
        <View className="mx-5 mb-2 flex-row gap-3">
          <StepCard
            step="3"
            title="See stats"
            body="Per-scope total, top category, daily average, transaction list."
          />
          <StepCard
            step="4"
            title="End anytime"
            body="Tap End now to close it. History stays."
          />
        </View>

        {hasTags ? <SectionHeader title="All tags" /> : null}

        {!hasTags ? (
          <View className="mt-6">
            <EmptyState
              icon={TagIcon}
              title="No tags yet"
              description="Add your first tag to start slicing your spending"
            />
          </View>
        ) : (
          tags.map((tag) => {
            const stat = statsByTag.get(tag.id);
            const isActive = activeTag?.id === tag.id;
            const hasDates = !!tag.start_date && !!tag.end_date;
            const onRowPress = hasDates
              ? () => router.push(tagScreen(tag.id))
              : undefined;
            return (
              <Pressable
                key={tag.id}
                onPress={onRowPress}
                disabled={!onRowPress}
                className={cn(
                  "mx-5 mb-2 flex-row items-center rounded-xl border px-4 py-3",
                  isActive
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <TagChip
                      name={tag.name}
                      color={tag.color}
                      emoji={tag.emoji}
                      size="md"
                    />
                    {isActive ? (
                      <Text className="rounded-full bg-primary/35 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                        Active
                      </Text>
                    ) : null}
                  </View>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {stat
                      ? `${stat.count} tx · ${fmt(stat.total)}`
                      : "Not used yet"}
                  </Text>
                </View>

                {/* Action group is always 4 slots so active and inactive rows
                    align identically. Slot 1 toggles between End-now (active)
                    and Activate (inactive); the other three are always
                    Schedule, Edit, Delete. */}
                {isActive && tag.start_date ? (
                  <IconButton
                    icon={Square}
                    tone="negative"
                    className="ml-2"
                    disabled={endNowMutation.isPending}
                    onPress={() =>
                      endNowMutation.mutate({
                        id: tag.id,
                        name: tag.name,
                        startAt: tag.start_date as string,
                      })
                    }
                  />
                ) : (
                  <IconButton
                    icon={Zap}
                    tone="primary"
                    className="ml-2"
                    disabled={scheduleMutation.isPending}
                    onPress={() => setQuickDurationTarget(tag.name)}
                  />
                )}
                <IconButton
                  icon={Calendar}
                  className="ml-1"
                  onPress={() =>
                    openSchedule({
                      id: tag.id,
                      name: tag.name,
                      startAt: tag.start_date ?? undefined,
                      endAt: tag.end_date ?? undefined,
                    })
                  }
                />
                <IconButton
                  icon={Palette}
                  tone="muted"
                  className="ml-1"
                  onPress={() => setAppearanceTarget(tag)}
                />
                <IconButton
                  icon={Pencil}
                  tone="muted"
                  className="ml-1"
                  onPress={() => setEditTarget({ id: tag.id, name: tag.name })}
                />
                <IconButton
                  icon={Trash2}
                  tone="negative"
                  className="ml-1"
                  onPress={() => handleDelete(tag.id, tag.name)}
                />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <ComponentErrorBoundary>
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

        {tagSheets}

        <TagAppearanceSheet
          visible={!!appearanceTarget}
          onClose={() => setAppearanceTarget(null)}
          tagName={appearanceTarget?.name ?? ""}
          initialColor={appearanceTarget?.color ?? null}
          initialEmoji={appearanceTarget?.emoji ?? null}
          onSave={async (color, emoji) => {
            if (!appearanceTarget) return;
            try {
              await appearanceMutation.mutateAsync({
                id: appearanceTarget.id,
                color,
                emoji,
              });
              setAppearanceTarget(null);
              showSuccessToast("Tag style updated");
            } catch (err) {
              showErrorToast("Failed to update style", err);
            }
          }}
        />

        <QuickDurationSheet
          visible={!!quickDurationTarget}
          onClose={() => setQuickDurationTarget(null)}
          tagName={quickDurationTarget ?? ""}
          onPick={(durationKey) => {
            if (!quickDurationTarget) return;
            const now = new Date();
            const name = quickDurationTarget;
            scheduleMutation.mutate(
              {
                name,
                startAt: format(now, DATE_TIME_FORMAT),
                endAt: format(durationEnd(durationKey, now), DATE_TIME_FORMAT),
              },
              {
                onSuccess: () =>
                  showSuccessToast(TAG_SCOPE_COPY.scopeStarted(name)),
                onError: (err) =>
                  showErrorToast(TAG_SCOPE_COPY.failedToStart, err),
              },
            );
            setQuickDurationTarget(null);
          }}
        />
      </ComponentErrorBoundary>
    </View>
  );
}

export const ErrorBoundary = ScreenError;

import { router } from "expo-router";
import { useState } from "react";
import { QuickStartTagSheet } from "@/components/quick-start-tag-sheet";
import { TagScheduleSheet } from "@/components/tag-schedule-sheet";
import { TAG_SCOPE_COPY, tagScreen } from "@/lib/constants";
import { showSuccessToast } from "@/lib/toast";
import { useScheduleTag, useUpdateSchedule } from "./use-tags";

type ScheduleTarget = {
  /** Set when scheduling an existing tag — triggers update instead of add. */
  id?: number;
  name?: string;
  startAt?: string;
  endAt?: string;
};

type UseTagSheetsOptions = {
  /**
   * After a successful create, navigate to the tag detail screen. Tag
   * detail screens (e.g. opening a tag from a list) want this; the tags
   * config screen does not (user stays on the tag list).
   */
  navigateOnSuccess?: boolean;
};

/**
 * Owns the QuickStart + Schedule sheets and their wiring. Returning the
 * sheets as JSX keeps the call sites tiny — they just render `{sheets}`
 * once and call `openQuickStart` / `openSchedule` as needed.
 */
export function useTagSheets(opts: UseTagSheetsOptions = {}) {
  const addMutation = useScheduleTag();
  const updateMutation = useUpdateSchedule();
  const [quickStart, setQuickStart] = useState<{ name?: string } | null>(null);
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);

  function openQuickStart(name?: string) {
    setQuickStart({ name });
  }

  function openSchedule(target?: ScheduleTarget) {
    setSchedule(target ?? {});
  }

  const sheets = (
    <>
      <QuickStartTagSheet
        visible={!!quickStart}
        defaultName={quickStart?.name}
        onClose={() => setQuickStart(null)}
        onSubmit={async (values) => {
          try {
            const { id } = await addMutation.mutateAsync(values);
            setQuickStart(null);
            showSuccessToast(TAG_SCOPE_COPY.scopeStarted(values.name));
            if (opts.navigateOnSuccess) router.push(tagScreen(id));
          } catch {
            // useScheduleTag's onError already toasted
            // "Failed to update schedule".
          }
        }}
      />

      <TagScheduleSheet
        visible={!!schedule}
        title={schedule?.name ? `Schedule #${schedule.name}` : "Schedule a Tag"}
        submitLabel={schedule?.id ? "Update" : "Schedule"}
        defaults={{
          name: schedule?.name,
          startAt: schedule?.startAt,
          endAt: schedule?.endAt,
        }}
        onClose={() => setSchedule(null)}
        onSubmit={async (values) => {
          try {
            if (schedule?.id) {
              await updateMutation.mutateAsync({
                id: schedule.id,
                ...values,
              });
            } else {
              const { id } = await addMutation.mutateAsync(values);
              if (opts.navigateOnSuccess) router.push(tagScreen(id));
            }
            setSchedule(null);
            showSuccessToast(`#${values.name} scheduled`);
          } catch {
            // useScheduleTag's/useUpdateSchedule's onError already toasted
            // "Failed to update schedule".
          }
        }}
      />
    </>
  );

  return { openQuickStart, openSchedule, sheets };
}

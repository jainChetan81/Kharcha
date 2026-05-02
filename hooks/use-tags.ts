import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DATE_TIME_FORMAT, QUERY_KEYS, TAG_SCOPE_COPY } from "@/lib/constants";
import {
  addTag,
  deleteTag,
  getActiveTag,
  getAllTags,
  getAllTimeTagBreakdown,
  getTagBreakdown,
  getTagStats,
  renameTag,
  scheduleTag,
  type TagAppearance,
  type TagScheduleInput,
  updateSchedule,
  updateTagAppearance,
} from "@/lib/db";
import { FIREBASE_EVENTS, logEvent } from "@/lib/firebase";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

export function useAllTags() {
  return useQuery({
    queryKey: [QUERY_KEYS.TAGS],
    queryFn: getAllTags,
  });
}

export function useTagBreakdown(yearMonth: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.TAG_BREAKDOWN, yearMonth],
    queryFn: () => getTagBreakdown(yearMonth),
  });
}

export function useAllTimeTagBreakdown() {
  return useQuery({
    queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
    queryFn: getAllTimeTagBreakdown,
  });
}

function useInvalidateTags() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TAGS] }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TAG_BREAKDOWN] }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TAG_BREAKDOWN_ALL_TIME],
      }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TAG_STATS] }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_TAG] }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTIONS] }),
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSACTIONS_PAGINATED],
      }),
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSACTION] }),
    ]);
}

export function useTagStats(id: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.TAG_STATS, id],
    queryFn: () => getTagStats(id),
    enabled: !!id,
  });
}

/**
 * The tag (if any) whose start..end window contains "now". Polls every 60s
 * so the UI flips automatically when a tag begins or ends without requiring
 * a manual refresh.
 */
export function useActiveTag() {
  return useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_TAG],
    queryFn: getActiveTag,
    refetchInterval: 60_000,
  });
}

export function useScheduleTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (input: TagScheduleInput) => scheduleTag(input),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.TAG_SCHEDULED);
      invalidate();
    },
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToUpdate, err);
    },
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & TagScheduleInput) =>
      updateSchedule(id, input),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.TAG_SCHEDULE_UPDATED);
      invalidate();
    },
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToUpdate, err);
    },
  });
}

/**
 * Cuts an active scope short — sets its end_at to "now". The tag keeps its
 * name and start, so historical stats stay intact; only the active window
 * closes. Used by the "End now" affordance on the home card and tags
 * screen.
 *
 * Toasts and analytics are owned by this hook so call sites just pass the
 * tag and don't have to wire success/error copy themselves — keeps the
 * call sites consistent and avoids copy drift.
 */
export function useEndScheduleNow() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (tag: { id: number; name: string; startAt: string }) => {
      const endAt = format(new Date(), DATE_TIME_FORMAT);
      return updateSchedule(tag.id, {
        name: tag.name,
        startAt: tag.startAt,
        endAt: endAt < tag.startAt ? tag.startAt : endAt,
      });
    },
    onSuccess: (_data, tag) => {
      logEvent(FIREBASE_EVENTS.TAG_SCHEDULE_ENDED);
      showSuccessToast(TAG_SCOPE_COPY.scopeEnded(tag.name));
      invalidate();
    },
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToEnd, err);
    },
  });
}

export function useAddTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (name: string) => addTag(name),
    onSuccess: () => invalidate(),
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToUpdateTag, err);
    },
  });
}

export function useRenameTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameTag(id, name),
    onSuccess: () => invalidate(),
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToUpdateTag, err);
    },
  });
}

export function useUpdateTagAppearance() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, ...appearance }: { id: number } & TagAppearance) =>
      updateTagAppearance(id, appearance),
    onSuccess: () => {
      logEvent(FIREBASE_EVENTS.TAG_APPEARANCE_UPDATED);
      invalidate();
    },
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => invalidate(),
    onError: (err) => {
      showErrorToast(TAG_SCOPE_COPY.failedToUpdateTag, err);
    },
  });
}

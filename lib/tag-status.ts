import { format } from "date-fns";
import { DATE_TIME_FORMAT } from "@/lib/constants";

export type TagTone = "active" | "upcoming" | "ended";

export type TagStatus = {
  label: string;
  tone: TagTone;
};

/**
 * Where the current time sits relative to a tag's scheduled scope. "Active"
 * means new transactions auto-tag with this tag right now; "upcoming" means
 * the scope hasn't started yet; "ended" means the window is past.
 */
export function tagStatus(startAt: string, endAt: string): TagStatus {
  const nowIso = format(new Date(), DATE_TIME_FORMAT);
  if (nowIso < startAt) return { label: "Upcoming", tone: "upcoming" };
  if (nowIso > endAt) return { label: "Ended", tone: "ended" };
  return { label: "Active", tone: "active" };
}

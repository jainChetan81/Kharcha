import { format, parse } from "date-fns";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";
import { DATE_TIME_FORMAT, TRANSACTION_TYPE } from "@/lib/constants";
import { ERROR_TYPE, logFirebaseError } from "@/lib/firebase";
import expo, { db } from "./connection";
import {
  categories,
  categoryRuleTags,
  tags,
  transactions,
  transactionTags,
} from "./schema";
import type { Tag, TagBreakdownRow, TagLite } from "./types";

export async function getAllTags(): Promise<Tag[]> {
  return db
    .select()
    .from(tags)
    .orderBy(asc(tags.sort_order), asc(tags.name)) as Promise<Tag[]>;
}

export async function addTag(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  const [existing] = await db
    .select()
    .from(tags)
    .where(sql`LOWER(${tags.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };

  const result = await db.insert(tags).values({ name: trimmed });
  return { id: Number(result.lastInsertRowId), isNew: true };
}

export type TagAppearance = {
  color?: string | null;
  emoji?: string | null;
};

export async function renameTag(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  return db.update(tags).set({ name: trimmed }).where(eq(tags.id, id));
}

/**
 * Update only the visual fields (color, emoji). Kept separate from rename
 * so the appearance editor doesn't have to know the current name to
 * change a color, and vice-versa.
 */
export async function updateTagAppearance(
  id: number,
  appearance: TagAppearance,
) {
  return db
    .update(tags)
    .set({
      color: appearance.color ?? null,
      emoji: appearance.emoji ?? null,
    })
    .where(eq(tags.id, id));
}

/**
 * Suggest tags for a merchant based on past usage on that same merchant
 * (case-insensitive). Returns the most-frequently-used tags first, capped
 * at `limit`. Used by the transaction form to surface a one-tap "add this
 * tag" affordance after the user types/selects a merchant.
 */
export async function getMostUsedTagsForMerchant(
  merchant: string,
  limit = 3,
): Promise<TagLite[]> {
  try {
    const trimmed = merchant.trim();
    if (!trimmed) return [];
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        emoji: tags.emoji,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(transactionTags.tag_id, tags.id))
      .innerJoin(
        transactions,
        eq(transactionTags.transaction_id, transactions.id),
      )
      .where(sql`LOWER(${transactions.merchant}) = LOWER(${trimmed})`)
      .groupBy(tags.id)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      emoji: r.emoji,
    }));
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "getMostUsedTagsForMerchant",
    });
    return [];
  }
}

export type TagScheduleInput = {
  name: string;
  /** Full datetime in `YYYY-MM-DD HH:MM` form. */
  startAt: string;
  /** Full datetime in `YYYY-MM-DD HH:MM` form. */
  endAt: string;
};

/**
 * Schedule a tag — give it a start..end window so new transactions during
 * that window auto-tag with it. If a tag with this name already exists, its
 * window is updated; otherwise a new tag is created.
 */
export async function scheduleTag(input: TagScheduleInput) {
  try {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Tag name is required");
    if (input.endAt < input.startAt) {
      throw new Error("End must be on or after start");
    }
    const [existing] = await db
      .select()
      .from(tags)
      .where(sql`LOWER(${tags.name}) = ${trimmed.toLowerCase()}`)
      .limit(1);
    if (existing) {
      await db
        .update(tags)
        .set({ start_date: input.startAt, end_date: input.endAt })
        .where(eq(tags.id, existing.id));
      return { id: existing.id, isNew: false };
    }
    const result = await db.insert(tags).values({
      name: trimmed,
      start_date: input.startAt,
      end_date: input.endAt,
    });
    return { id: Number(result.lastInsertRowId), isNew: true };
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "scheduleTag",
    });
    throw error;
  }
}

export async function updateSchedule(id: number, input: TagScheduleInput) {
  try {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Tag name is required");
    if (input.endAt < input.startAt) {
      throw new Error("End must be on or after start");
    }
    return await db
      .update(tags)
      .set({
        name: trimmed,
        start_date: input.startAt,
        end_date: input.endAt,
      })
      .where(eq(tags.id, id));
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "updateSchedule",
      tag_id: String(id),
    });
    throw error;
  }
}

export async function deleteTag(id: number) {
  await expo.withTransactionAsync(async () => {
    await db.delete(transactionTags).where(eq(transactionTags.tag_id, id));
    // Drop any rule→tag links so deleting a tag doesn't leave rules
    // referencing a missing tag id (expo-sqlite has FK enforcement off).
    await db.delete(categoryRuleTags).where(eq(categoryRuleTags.tag_id, id));
    await db.delete(tags).where(eq(tags.id, id));
  });
}

export async function getTagsForTransactions(
  transactionIds: number[],
): Promise<Map<number, TagLite[]>> {
  const map = new Map<number, TagLite[]>();
  if (transactionIds.length === 0) return map;
  const rows = await db
    .select({
      transaction_id: transactionTags.transaction_id,
      id: tags.id,
      name: tags.name,
      sort_order: tags.sort_order,
      color: tags.color,
      emoji: tags.emoji,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tag_id, tags.id))
    .where(inArray(transactionTags.transaction_id, transactionIds))
    .orderBy(asc(tags.sort_order), asc(tags.name));
  for (const row of rows) {
    const list = map.get(row.transaction_id);
    const entry = {
      id: row.id,
      name: row.name,
      color: row.color,
      emoji: row.emoji,
    };
    if (list) list.push(entry);
    else map.set(row.transaction_id, [entry]);
  }
  return map;
}

export async function getTagBreakdown(
  yearMonth: string,
): Promise<TagBreakdownRow[]> {
  const rows = await db
    .select({
      tag_id: tags.id,
      tag_name: tags.name,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      count: sql<number>`COUNT(DISTINCT ${transactions.id})`,
    })
    .from(tags)
    .innerJoin(transactionTags, eq(transactionTags.tag_id, tags.id))
    .innerJoin(
      transactions,
      eq(transactionTags.transaction_id, transactions.id),
    )
    .where(
      and(
        eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
        sql`strftime('%Y-%m', ${transactions.date}) = ${yearMonth}`,
      ),
    )
    .groupBy(tags.id)
    .orderBy(sql`SUM(${transactions.amount}) DESC`);

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);
  return rows.map((r) => ({
    tag_id: r.tag_id,
    tag_name: r.tag_name,
    total: Number(r.total),
    count: Number(r.count),
    percentage: grandTotal > 0 ? (Number(r.total) / grandTotal) * 100 : 0,
  }));
}

/**
 * Returns the tag whose scheduled scope contains "now". If multiple
 * scoped tags overlap, picks the most recently started one.
 */
export async function getActiveTag(): Promise<Tag | null> {
  try {
    const nowIso = format(new Date(), DATE_TIME_FORMAT);
    const [row] = await db
      .select()
      .from(tags)
      .where(
        and(
          isNotNull(tags.start_date),
          isNotNull(tags.end_date),
          lte(tags.start_date, nowIso),
          gte(tags.end_date, nowIso),
        ),
      )
      .orderBy(desc(tags.start_date))
      .limit(1);
    return row ?? null;
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "getActiveTag",
    });
    return null;
  }
}

export type TagStats = {
  tag: Tag;
  total: number;
  count: number;
  topCategoryName: string | null;
  topCategoryTotal: number;
  /** Scope duration in ms (from start_date to end_date). */
  totalMs: number;
  /** Time elapsed in ms (capped at totalMs once the scope has ended). */
  elapsedMs: number;
};

export async function getTagStats(tagId: number): Promise<TagStats | null> {
  try {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, tagId))
      .limit(1);
    if (!tag?.start_date || !tag.end_date) return null;

    const dateFrom = tag.start_date;
    const dateTo = tag.end_date;

    const [totals] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(DISTINCT ${transactions.id})`,
      })
      .from(transactionTags)
      .innerJoin(
        transactions,
        eq(transactionTags.transaction_id, transactions.id),
      )
      .where(
        and(
          eq(transactionTags.tag_id, tagId),
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          gte(transactions.date, dateFrom),
          lte(transactions.date, dateTo),
        ),
      );

    const [topCategory] = await db
      .select({
        category_id: transactions.category_id,
        category_name: categories.name,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactionTags)
      .innerJoin(
        transactions,
        eq(transactionTags.transaction_id, transactions.id),
      )
      .leftJoin(categories, eq(transactions.category_id, categories.id))
      .where(
        and(
          eq(transactionTags.tag_id, tagId),
          eq(transactions.type, TRANSACTION_TYPE.EXPENSE),
          gte(transactions.date, dateFrom),
          lte(transactions.date, dateTo),
        ),
      )
      .groupBy(transactions.category_id)
      .orderBy(sql`SUM(${transactions.amount}) DESC`)
      .limit(1);

    const startMs = parse(
      tag.start_date,
      DATE_TIME_FORMAT,
      new Date(),
    ).getTime();
    const endMs = parse(tag.end_date, DATE_TIME_FORMAT, new Date()).getTime();
    const totalMs = Math.max(0, endMs - startMs);
    const nowMs = Date.now();
    const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - startMs));

    return {
      tag,
      total: Number(totals?.total ?? 0),
      count: Number(totals?.count ?? 0),
      topCategoryName: topCategory?.category_name ?? null,
      topCategoryTotal: Number(topCategory?.total ?? 0),
      totalMs,
      elapsedMs,
    };
  } catch (error) {
    logFirebaseError(error, {
      error_type: ERROR_TYPE.DB,
      operation: "getTagStats",
      tag_id: String(tagId),
    });
    throw error;
  }
}

export async function getAllTimeTagBreakdown(): Promise<TagBreakdownRow[]> {
  const rows = await db
    .select({
      tag_id: tags.id,
      tag_name: tags.name,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      count: sql<number>`COUNT(DISTINCT ${transactions.id})`,
    })
    .from(tags)
    .innerJoin(transactionTags, eq(transactionTags.tag_id, tags.id))
    .innerJoin(
      transactions,
      eq(transactionTags.transaction_id, transactions.id),
    )
    .where(eq(transactions.type, TRANSACTION_TYPE.EXPENSE))
    .groupBy(tags.id)
    .orderBy(sql`SUM(${transactions.amount}) DESC`);

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);
  return rows.map((r) => ({
    tag_id: r.tag_id,
    tag_name: r.tag_name,
    total: Number(r.total),
    count: Number(r.count),
    percentage: grandTotal > 0 ? (Number(r.total) / grandTotal) * 100 : 0,
  }));
}

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { TRANSACTION_TYPE } from "@/lib/constants";
import { db } from "./connection";
import { tags, transactions, transactionTags } from "./schema";
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

export async function renameTag(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  return db.update(tags).set({ name: trimmed }).where(eq(tags.id, id));
}

export async function deleteTag(id: number) {
  await db
    .delete(transactionTags)
    .where(eq(transactionTags.tag_id, id));
  return db.delete(tags).where(eq(tags.id, id));
}

export async function updateTagOrder(
  items: { id: number; sort_order: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(tags)
        .set({ sort_order: item.sort_order })
        .where(eq(tags.id, item.id));
    }
  });
}

export async function getTagsForTransaction(
  transactionId: number,
): Promise<TagLite[]> {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tag_id, tags.id))
    .where(eq(transactionTags.transaction_id, transactionId))
    .orderBy(asc(tags.sort_order), asc(tags.name));
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
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tag_id, tags.id))
    .where(inArray(transactionTags.transaction_id, transactionIds))
    .orderBy(asc(tags.sort_order), asc(tags.name));
  for (const row of rows) {
    const list = map.get(row.transaction_id);
    const entry = { id: row.id, name: row.name };
    if (list) list.push(entry);
    else map.set(row.transaction_id, [entry]);
  }
  return map;
}

export async function setTransactionTags(
  transactionId: number,
  tagIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(transactionTags)
      .where(eq(transactionTags.transaction_id, transactionId));
    if (tagIds.length === 0) return;
    const unique = Array.from(new Set(tagIds));
    await tx.insert(transactionTags).values(
      unique.map((tag_id) => ({
        transaction_id: transactionId,
        tag_id,
      })),
    );
  });
}

export async function getTransactionIdsForTags(
  tagIds: number[],
): Promise<number[]> {
  if (tagIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ transaction_id: transactionTags.transaction_id })
    .from(transactionTags)
    .where(inArray(transactionTags.tag_id, tagIds));
  return rows.map((r) => r.transaction_id);
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
    .innerJoin(transactions, eq(transactionTags.transaction_id, transactions.id))
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
    .innerJoin(transactions, eq(transactionTags.transaction_id, transactions.id))
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

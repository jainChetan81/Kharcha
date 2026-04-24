import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./connection";
import { sources } from "./schema";
import type { Source } from "./types";

export async function getAllSources(): Promise<Source[]> {
  return db.select().from(sources).orderBy(asc(sources.sort_order)) as Promise<
    Source[]
  >;
}

export async function updateSourceOrder(
  items: { id: number; sort_order: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(sources)
        .set({ sort_order: item.sort_order })
        .where(eq(sources.id, item.id));
    }
  });
}

export async function addSource(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Source name is required");
  const [existing] = await db
    .select()
    .from(sources)
    .where(sql`LOWER(${sources.name}) = ${trimmed.toLowerCase()}`)
    .limit(1);
  if (existing) return { id: existing.id, isNew: false };
  const result = await db
    .insert(sources)
    .values({ name: trimmed, is_default: 0 });
  return { id: Number(result.lastInsertRowId), isNew: true };
}

export async function deleteSource(id: number) {
  return db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
}

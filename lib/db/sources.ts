import { and, asc, eq } from "drizzle-orm";
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
  return db.insert(sources).values({ name, is_default: 0 });
}

export async function deleteSource(id: number) {
  return db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
}

import { and, eq } from "drizzle-orm";
import { db } from "./connection";
import { sources } from "./schema";
import type { Source } from "./types";

export async function getAllSources(): Promise<Source[]> {
  return db.select().from(sources) as Promise<Source[]>;
}

export async function addSource(name: string) {
  return db.insert(sources).values({ name, is_default: 0 });
}

export async function deleteSource(id: number) {
  return db
    .delete(sources)
    .where(and(eq(sources.id, id), eq(sources.is_default, 0)));
}

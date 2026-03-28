import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { config } from "./schema";

export async function getConfig(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: config.value })
    .from(config)
    .where(eq(config.key, key));
  return rows[0]?.value ?? null;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await db.select().from(config);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function updateConfig(key: string, value: string): Promise<void> {
  await db
    .insert(config)
    .values({ key, value })
    .onConflictDoUpdate({ target: config.key, set: { value } });
}

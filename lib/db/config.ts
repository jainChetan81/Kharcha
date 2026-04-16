import { eq } from "drizzle-orm";
import { configSchema } from "@/lib/validation";
import { db } from "./connection";
import { config } from "./schema";
import type { ConfigRow } from "./types";

export async function getConfig(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: config.value })
    .from(config)
    .where(eq(config.key, key));
  return rows[0]?.value ?? null;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows: ConfigRow[] = await db.select().from(config);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function updateConfig(key: string, value: string): Promise<void> {
  const validation = configSchema.safeParse({ key, value });
  if (!validation.success) {
    throw new Error(
      `Invalid config: ${validation.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  await db
    .insert(config)
    .values(validation.data)
    .onConflictDoUpdate({
      target: config.key,
      set: { value: validation.data.value },
    });
}

export async function deleteConfig(key: string): Promise<void> {
  await db.delete(config).where(eq(config.key, key));
}

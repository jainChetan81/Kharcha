import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";
import { db } from "./connection";
import { transactions } from "./schema";

const dbFile = new File(Paths.document, "SQLite", DB_NAME);

export async function exportDatabase(): Promise<void> {
  if (!dbFile.exists) {
    throw new Error("Database file not found");
  }
  const Sharing = await import("expo-sharing");
  await Sharing.shareAsync(dbFile.uri, {
    mimeType: "application/octet-stream",
    dialogTitle: "Export kharcha data",
  });
}

export async function pickDatabaseFile(): Promise<string | null> {
  const picked = await File.pickFileAsync();
  if (!picked) return null;
  const file = Array.isArray(picked) ? picked[0] : picked;
  return file.uri;
}

export async function importDatabaseReplace(fileUri: string): Promise<void> {
  const source = new File(fileUri);
  source.copy(dbFile);
}

export async function importDatabaseMerge(fileUri: string): Promise<number> {
  const tempFile = new File(Paths.cache, "import_temp.db");
  const source = new File(fileUri);
  source.copy(tempFile);

  const tempExpo = SQLite.openDatabaseSync("import_temp.db");
  const tempDb = drizzle(tempExpo, { logger: false });

  const importedRows = await tempDb
    .select({
      type: transactions.type,
      amount: transactions.amount,
      merchant: transactions.merchant,
      category_id: transactions.category_id,
      source_id: transactions.source_id,
      date: transactions.date,
      note: transactions.note,
    })
    .from(transactions);

  let merged = 0;
  for (const row of importedRows) {
    const existing = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.date, row.date),
          eq(transactions.amount, row.amount),
          ...(row.merchant ? [eq(transactions.merchant, row.merchant)] : []),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(transactions).values({
        type: row.type,
        amount: row.amount,
        merchant: row.merchant,
        category_id: row.category_id,
        source_id: row.source_id,
        source_type: "manual",
        date: row.date,
        note: row.note,
      });
      merged++;
    }
  }

  tempExpo.closeSync();
  tempFile.delete();

  return merged;
}

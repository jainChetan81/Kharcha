import { format } from "date-fns";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { DATE_ISO_FORMAT } from "@/lib/constants";
import { checkpointWal } from "./connection";
import { deleteDbSidecars, getDbFile, isSqliteBytes } from "./files";

const DB_MIMETYPE = "application/x-sqlite3";
const DB_UTI = "public.database";

export async function exportDatabase(): Promise<void> {
  const src = getDbFile();
  if (!src.exists) {
    throw new Error("Database file not found");
  }
  // Flush in-memory WAL pages into the main file so the exported snapshot
  // includes the user's most recent writes, not just whatever was
  // checkpointed last.
  checkpointWal();
  const timestamp = format(new Date(), DATE_ISO_FORMAT);
  const dest = new File(Paths.cache, `kharcha-backup-${timestamp}.db`);
  if (dest.exists) dest.delete();
  src.copy(dest);
  await shareAsync(dest.uri, {
    mimeType: DB_MIMETYPE,
    UTI: DB_UTI,
    dialogTitle: "Export Kharcha Database",
  });
}

export type ImportResult = { imported: boolean; reason?: string };

export async function importDatabase(): Promise<ImportResult> {
  const picked = await getDocumentAsync({
    type: ["application/octet-stream", DB_MIMETYPE, "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || picked.assets.length === 0) {
    return { imported: false, reason: "cancelled" };
  }
  const asset = picked.assets[0];
  const src = new File(asset.uri);
  if (!src.exists) {
    return { imported: false, reason: "picked file not found" };
  }
  // Verify the picked file is actually a SQLite database before we touch
  // the live DB. Without this, picking a JPG or PDF by accident would
  // brick the app on next boot.
  const bytes = await src.bytes();
  if (!isSqliteBytes(bytes)) {
    throw new Error("Selected file is not a valid Kharcha database backup.");
  }
  const dest = getDbFile();
  if (dest.exists) dest.delete();
  deleteDbSidecars();
  src.copy(dest);
  return { imported: true };
}

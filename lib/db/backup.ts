import { format } from "date-fns";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { DATE_ISO_FORMAT, DB_NAME } from "@/lib/constants";

const SQLITE_SUBDIR = "SQLite";
const DB_MIMETYPE = "application/x-sqlite3";
const DB_UTI = "public.database";

function getDbFile(): File {
  return new File(Paths.document, SQLITE_SUBDIR, DB_NAME);
}

export async function exportDatabase(): Promise<void> {
  const src = getDbFile();
  if (!src.exists) {
    throw new Error("Database file not found");
  }
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
  const dest = getDbFile();
  if (dest.exists) dest.delete();
  src.copy(dest);
  return { imported: true };
}

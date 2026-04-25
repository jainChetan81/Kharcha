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

export type PickedBackup = {
  uri: string;
  bytes: Uint8Array;
};

// Pick a file and load its bytes into memory for inspection. Does NOT
// touch the live DB — that only happens in `commitImport` after the user
// confirms the preview. Magic-header check happens here so non-SQLite
// files are rejected before we even try to deserialize them.
export async function pickBackupFile(): Promise<PickedBackup | null> {
  const picked = await getDocumentAsync({
    type: ["application/octet-stream", DB_MIMETYPE, "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || picked.assets.length === 0) {
    return null;
  }
  const asset = picked.assets[0];
  const src = new File(asset.uri);
  if (!src.exists) {
    throw new Error("Picked file not found");
  }
  const bytes = await src.bytes();
  if (!isSqliteBytes(bytes)) {
    throw new Error("Selected file is not a valid Kharcha database backup.");
  }
  return { uri: asset.uri, bytes };
}

// Commit a previously picked + inspected backup to the live DB. Caller is
// responsible for: (a) inspecting via `inspectBackupBytes` first, and
// (b) running `initDB()` after to back-fill any schema columns the
// restored backup is missing.
export function commitImport(picked: PickedBackup): void {
  const src = new File(picked.uri);
  if (!src.exists) {
    throw new Error("Picked file no longer exists in cache.");
  }
  const dest = getDbFile();
  if (dest.exists) dest.delete();
  deleteDbSidecars();
  src.copy(dest);
}

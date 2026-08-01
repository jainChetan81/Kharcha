import { format } from "date-fns";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { DATE_ISO_FORMAT } from "@/lib/constants";
import { closeDatabase, reopenDatabase, vacuumInto } from "./connection";
import {
  commitStagedFile,
  deleteDbSidecars,
  discardStagedFile,
  getDbFile,
  isSqliteBytes,
  stageFile,
} from "./files";

const DB_MIMETYPE = "application/x-sqlite3";
const DB_UTI = "public.database";

// `File.uri` is a file:// URI with percent-encoding; SQLite's VACUUM INTO
// wants a plain filesystem path.
function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

// Materialize a clean point-in-time snapshot of the live DB in the cache
// dir, hand it to `fn`, and delete it afterwards. Snapshots come from
// VACUUM INTO rather than a raw file copy — a copy of the live file keeps
// the WAL flag in the DB header (even after a checkpoint), and our own
// import preview (`deserializeDatabaseAsync`) can't open WAL-mode files.
// Shared by the local export and the cloud backup upload so both produce
// files the app can restore.
export async function withDbSnapshot<T>(
  filename: string,
  fn: (snapshot: File) => T | Promise<T>,
): Promise<T> {
  const src = getDbFile();
  if (!src.exists) {
    throw new Error("Database file not found");
  }
  const snapshot = new File(Paths.cache, filename);
  // VACUUM INTO refuses to overwrite an existing target.
  if (snapshot.exists) snapshot.delete();
  vacuumInto(uriToPath(snapshot.uri));
  try {
    return await fn(snapshot);
  } finally {
    try {
      if (snapshot.exists) snapshot.delete();
    } catch {
      // Best-effort cleanup — a stale cache file is harmless.
    }
  }
}

export async function exportDatabase(): Promise<void> {
  const timestamp = format(new Date(), DATE_ISO_FORMAT);
  await withDbSnapshot(`kharcha-backup-${timestamp}.db`, (snapshot) =>
    shareAsync(snapshot.uri, {
      mimeType: DB_MIMETYPE,
      UTI: DB_UTI,
      dialogTitle: "Export Kharcha Database",
    }),
  );
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

// Commit a previously picked + inspected backup to the live DB. Stages the
// copy beside the live file and verifies it before touching anything — if
// the copy fails or is truncated (disk full, interrupted app), the live DB
// is never deleted. Only once the stage is confirmed complete does this
// close the module-level connection and swap it in, reopening after so
// migrations/queries run against the restored file instead of the deleted
// inode the old handle would keep alive. Caller is responsible for:
// (a) inspecting via `inspectBackupBytes` first, and (b) running `initDB()`
// after to back-fill any schema columns the restored backup is missing.
export function commitImport(picked: PickedBackup): void {
  const src = new File(picked.uri);
  if (!src.exists) {
    throw new Error("Picked file no longer exists in cache.");
  }
  const dest = getDbFile();
  const staging = stageFile(dest, (s) => src.copy(s));
  if (staging.size !== src.size) {
    discardStagedFile(staging);
    throw new Error(
      `Import copy incomplete: expected ${src.size} bytes, wrote ${staging.size}.`,
    );
  }
  closeDatabase();
  try {
    deleteDbSidecars();
    commitStagedFile(staging, dest);
  } finally {
    // Reopen even if the swap failed midway — leaving the module-level
    // handle closed would break every subsequent query in the session.
    reopenDatabase();
  }
}

// iCloud Drive backup. Relies on `NSUbiquitousContainerIsDocumentScopePublic = true`
// in Info.plist (configured in app.json) which makes the app's Documents
// directory the public ubiquity container — so files written to
// `Paths.document/...` are uploaded to iCloud Drive by the OS.
//
// Caveats:
//   - User must be signed into iCloud on the device.
//   - User must have iCloud Drive enabled in Settings → Apple ID → iCloud.
//   - First-time sync can take a few minutes; the OS does it opportunistically.
//   - We can't *force* a sync from the JS side; we trust the OS's coordinator.
//   - Restore on a fresh install: the OS streams the file down on demand
//     when we read it; reading may briefly fail with ENOENT until the
//     download completes — surfaced as ICloudSyncingError.
import { Directory, File, Paths } from "expo-file-system";
import { commitStagedFile, discardStagedFile, stageFile } from "@/lib/db/files";

const BACKUP_DIR = "iCloud-Backup";
const BACKUP_FILENAME = "kharcha-backup.db";

function getBackupDir(): Directory {
  return new Directory(Paths.document, BACKUP_DIR);
}

function getBackupFile(): File {
  return new File(Paths.document, BACKUP_DIR, BACKUP_FILENAME);
}

export async function uploadBackupToICloud(
  body: ArrayBuffer,
): Promise<{ modifiedTime: string }> {
  const dir = getBackupDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const view = new Uint8Array(body);
  const file = getBackupFile();
  // Stage the upload beside the existing backup and verify it's complete
  // before replacing anything — previously this deleted the last-known-good
  // backup first, so a failed/interrupted write left nothing behind.
  const staging = stageFile(file, (s) => {
    s.create();
    s.write(view);
  });
  if (staging.size !== view.byteLength) {
    discardStagedFile(staging);
    throw new Error(
      `iCloud backup write incomplete: expected ${view.byteLength} bytes, wrote ${staging.size}.`,
    );
  }
  commitStagedFile(staging, file);
  return { modifiedTime: new Date().toISOString() };
}

export type ICloudBackupFile = {
  modifiedTime: string;
  size: number;
};

export async function getLatestICloudBackup(): Promise<ICloudBackupFile | null> {
  const file = getBackupFile();
  if (!file.exists) return null;
  return {
    modifiedTime: file.modificationTime
      ? new Date(file.modificationTime).toISOString()
      : new Date().toISOString(),
    size: file.size ?? 0,
  };
}

export class ICloudSyncingError extends Error {
  constructor() {
    super("iCloud backup still syncing — try again in a minute.");
    this.name = "ICloudSyncingError";
  }
}

export async function downloadBackupFromICloud(): Promise<ArrayBuffer> {
  const file = getBackupFile();
  if (!file.exists) {
    // Ambiguous between "no backup ever made" and "iCloud hasn't streamed
    // it down yet on this fresh install." Caller decides the copy.
    throw new ICloudSyncingError();
  }
  const bytes = await file.bytes();
  return bytes.slice().buffer;
}

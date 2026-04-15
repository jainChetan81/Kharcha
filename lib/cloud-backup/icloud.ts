// iCloud Drive backup. iOS auto-syncs the app's Documents directory to
// iCloud Drive when the iCloud entitlements are configured in app.json (see
// `ios.entitlements.com.apple.developer.icloud-*` keys). No native module
// required — we just write the SQLite snapshot into a sub-folder of
// `Paths.document` and the OS handles the upload.
//
// Caveats:
//   - User must be signed into iCloud on the device.
//   - User must have iCloud Drive enabled in Settings → Apple ID → iCloud.
//   - First-time sync can take a few minutes; the OS does it opportunistically.
//   - We can't *force* a sync from the JS side; we trust the OS's coordinator.
//   - Restore on a fresh install: the OS streams the file down on demand
//     when we read it; reading may briefly fail with ENOENT until the
//     download completes.
import { Directory, File, Paths } from "expo-file-system";

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
  const file = getBackupFile();
  if (file.exists) file.delete();
  // expo-file-system v2 File API — write the binary blob.
  file.create();
  file.write(new Uint8Array(body));
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

export async function downloadBackupFromICloud(): Promise<ArrayBuffer> {
  const file = getBackupFile();
  if (!file.exists) {
    throw new Error("No iCloud backup found on this device");
  }
  const bytes = file.bytes();
  // bytes() returns Uint8Array; clone to a fresh ArrayBuffer to detach
  // from the file's internal buffer.
  return bytes.slice().buffer;
}

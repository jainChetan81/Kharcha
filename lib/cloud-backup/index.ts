// Cloud backup dispatcher. Picks iCloud on iOS and Google Drive on Android.
//
// Backup format: raw SQLite file bytes (no app-layer encryption). Both
// providers encrypt at rest by default (Apple/Google managed keys), and
// adding a passphrase-derived key would break "just works" auto-restore on
// a fresh install. We may add an optional passphrase later.
import { Platform } from "react-native";
import { CONFIG_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { checkpointWal } from "@/lib/db/connection";
import { deleteDbSidecars, getDbFile, isSqliteBytes } from "@/lib/db/files";
import { withTrace } from "@/lib/firebase";
import {
  type DriveBackupFile,
  downloadBackupFromDrive,
  getLatestDriveBackup,
  uploadBackupToDrive,
} from "./gdrive";
import {
  downloadBackupFromICloud,
  getLatestICloudBackup,
  type ICloudBackupFile,
  uploadBackupToICloud,
} from "./icloud";

export { DriveScopeMissingError } from "./gdrive";
export { ICloudSyncingError } from "./icloud";

export type Provider = "icloud" | "gdrive" | "unsupported";

export function getProvider(): Provider {
  if (Platform.OS === "ios") return "icloud";
  if (Platform.OS === "android") return "gdrive";
  return "unsupported";
}

export type BackupSummary = {
  modifiedTime: string;
  size: number;
  provider: Provider;
};

async function readDbBytes(): Promise<ArrayBuffer> {
  checkpointWal();
  const src = getDbFile();
  if (!src.exists) throw new Error("Database file not found");
  const bytes = await src.bytes();
  return bytes.slice().buffer;
}

function writeDbBytes(bytes: ArrayBuffer): void {
  // Reject anything that isn't a SQLite database before we touch the
  // live file. Cloud blobs can be truncated downloads, manually replaced
  // files in Drive, or wrong-revision payloads — without this guard those
  // brick the app on next open the same way a bad picker file would.
  const view = new Uint8Array(bytes);
  if (!isSqliteBytes(view)) {
    throw new Error("Cloud backup is not a valid Kharcha database file.");
  }
  const dest = getDbFile();
  if (dest.exists) dest.delete();
  deleteDbSidecars();
  dest.create();
  dest.write(view);
}

export async function backupNow(): Promise<BackupSummary> {
  const provider = getProvider();
  return withTrace(
    "cloud_backup",
    async () => {
      const bytes = await readDbBytes();
      let modifiedTime: string;
      let fileId: string | undefined;

      if (provider === "icloud") {
        const r = await uploadBackupToICloud(bytes);
        modifiedTime = r.modifiedTime;
      } else if (provider === "gdrive") {
        const r = await uploadBackupToDrive(bytes);
        modifiedTime = r.modifiedTime;
        fileId = r.fileId;
      } else {
        throw new Error("Cloud backup not supported on this platform");
      }

      await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_AT, modifiedTime);
      if (fileId) {
        await updateConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_FILE_ID, fileId);
      }

      return { modifiedTime, size: bytes.byteLength, provider };
    },
    { provider },
  );
}

export async function getLatestBackup(): Promise<BackupSummary | null> {
  const provider = getProvider();
  if (provider === "icloud") {
    const f: ICloudBackupFile | null = await getLatestICloudBackup();
    return f ? { ...f, provider } : null;
  }
  if (provider === "gdrive") {
    const f: DriveBackupFile | null = await getLatestDriveBackup();
    return f ? { modifiedTime: f.modifiedTime, size: f.size, provider } : null;
  }
  return null;
}

export async function restoreFromCloud(): Promise<void> {
  const provider = getProvider();
  let bytes: ArrayBuffer;
  if (provider === "icloud") {
    bytes = await downloadBackupFromICloud();
  } else if (provider === "gdrive") {
    const latest = await getLatestDriveBackup();
    if (!latest) throw new Error("No backup found in Google Drive");
    bytes = await downloadBackupFromDrive(latest.id);
  } else {
    throw new Error("Cloud restore not supported on this platform");
  }
  writeDbBytes(bytes);
}

// Auto-backup on app foreground when the last backup is older than 24h.
// Caller is responsible for gating on user opt-in (CLOUD_BACKUP_ENABLED).
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// iOS fires AppState "active" more than once per resume (e.g. after
// passcode/Face ID dismiss). Without this gate two concurrent backups
// can race on the same Drive file / iCloud path.
let autoBackupInFlight = false;

export async function maybeAutoBackup(): Promise<void> {
  if (autoBackupInFlight) return;
  const enabled = await getConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED);
  if (enabled !== "1") return;
  const lastAt = await getConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_AT);
  if (lastAt) {
    const ageMs = Date.now() - new Date(lastAt).getTime();
    if (ageMs < AUTO_BACKUP_INTERVAL_MS) return;
  }
  autoBackupInFlight = true;
  try {
    await backupNow();
  } catch {
    // Swallow — auto-backup is best-effort, never crash the app.
  } finally {
    autoBackupInFlight = false;
  }
}

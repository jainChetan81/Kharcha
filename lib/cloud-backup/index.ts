// Cloud backup dispatcher. Picks iCloud on iOS and Google Drive on Android.
//
// Backup format: raw SQLite file bytes (no app-layer encryption). Both
// providers encrypt at rest by default (Apple/Google managed keys), and
// adding a passphrase-derived key would break "just works" auto-restore on
// a fresh install. We may add an optional passphrase later.
//
// WAL caveat: expo-sqlite uses WAL by default, so a naive file copy could
// miss un-checkpointed writes. We accept this for now (matches the existing
// `lib/db/backup.ts` behaviour); for a hardened backup we'd run
// `PRAGMA wal_checkpoint(TRUNCATE)` before reading.
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { CONFIG_KEYS, DB_NAME } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import {
  type DriveBackupFile,
  downloadBackupFromDrive,
  getLatestDriveBackup,
  uploadBackupToDrive,
} from "./gdrive";
import {
  type ICloudBackupFile,
  downloadBackupFromICloud,
  getLatestICloudBackup,
  uploadBackupToICloud,
} from "./icloud";

const SQLITE_SUBDIR = "SQLite";

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

function getDbFile(): File {
  return new File(Paths.document, SQLITE_SUBDIR, DB_NAME);
}

function readDbBytes(): ArrayBuffer {
  const src = getDbFile();
  if (!src.exists) throw new Error("Database file not found");
  return src.bytes().slice().buffer;
}

function writeDbBytes(bytes: ArrayBuffer): void {
  const dest = getDbFile();
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(new Uint8Array(bytes));
}

export async function backupNow(): Promise<BackupSummary> {
  const provider = getProvider();
  const bytes = readDbBytes();
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
}

export async function getLatestBackup(): Promise<BackupSummary | null> {
  const provider = getProvider();
  if (provider === "icloud") {
    const f: ICloudBackupFile | null = await getLatestICloudBackup();
    return f ? { ...f, provider } : null;
  }
  if (provider === "gdrive") {
    const f: DriveBackupFile | null = await getLatestDriveBackup();
    return f
      ? { modifiedTime: f.modifiedTime, size: f.size, provider }
      : null;
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

export async function maybeAutoBackup(): Promise<void> {
  const enabled = await getConfig(CONFIG_KEYS.CLOUD_BACKUP_ENABLED);
  if (enabled !== "1") return;
  const lastAt = await getConfig(CONFIG_KEYS.CLOUD_BACKUP_LAST_AT);
  if (lastAt) {
    const ageMs = Date.now() - new Date(lastAt).getTime();
    if (ageMs < AUTO_BACKUP_INTERVAL_MS) return;
  }
  try {
    await backupNow();
  } catch {
    // Swallow — auto-backup is best-effort, never crash the app.
  }
}

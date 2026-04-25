// SQLite file-system helpers shared by the local backup picker and the
// cloud backup paths. Both rewrite the live DB file and have to handle
// the WAL/SHM sidecars and reject non-SQLite payloads identically —
// keeping the logic in one place avoids the two paths drifting.
import { File, Paths } from "expo-file-system";
import { DB_NAME } from "@/lib/constants";

const SQLITE_SUBDIR = "SQLite";

// "SQLite format 3\0" — every valid SQLite v3 database starts with these
// 16 bytes. Used to reject non-database payloads before we overwrite the
// live DB (corrupt cloud blob, picked PDF/JPG, truncated download).
const SQLITE_MAGIC = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74,
  0x20, 0x33, 0x00,
]);

export function getDbFile(): File {
  return new File(Paths.document, SQLITE_SUBDIR, DB_NAME);
}

// SQLite keeps `<DB_NAME>-wal` and `<DB_NAME>-shm` next to the main file
// in WAL mode. Both must be cleared whenever the main file is replaced,
// otherwise SQLite applies stale WAL frames to the new DB on next open
// and either corrupts it or surfaces phantom rows from the old data.
export function deleteDbSidecars(): void {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = new File(
      Paths.document,
      SQLITE_SUBDIR,
      `${DB_NAME}${suffix}`,
    );
    if (sidecar.exists) sidecar.delete();
  }
}

export function isSqliteBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < SQLITE_MAGIC.byteLength) return false;
  for (let i = 0; i < SQLITE_MAGIC.byteLength; i++) {
    if (bytes[i] !== SQLITE_MAGIC[i]) return false;
  }
  return true;
}

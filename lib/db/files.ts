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

// Atomic-replace helpers shared by every path that overwrites a live file
// with untrusted/fallible input (local DB import, cloud DB restore, cloud
// backup upload). The old delete-then-write pattern destroyed the live file
// before the replacement was confirmed complete — a disk-full or
// interrupted write left nothing behind. These stage the write beside the
// destination first, so the only thing that touches the destination is a
// same-directory `move()` (a rename, not a byte copy) after the write is
// verified — and if the write fails, the destination was never touched.

// Write into a staging file next to `destination`. Caller supplies how to
// populate it (copy or create+write); the destination itself is untouched.
export function stageFile(
  destination: File,
  write: (staging: File) => void,
): File {
  const staging = new File(`${destination.uri}.staging`);
  if (staging.exists) staging.delete();
  write(staging);
  return staging;
}

// Replace `destination` with an already-verified `staging` file. The slow,
// fallible part (the write) already happened and was checked before this
// runs, so the only failure window left is the delete + rename itself.
export function commitStagedFile(staging: File, destination: File): void {
  try {
    if (destination.exists) destination.delete();
    staging.move(destination);
  } finally {
    discardStagedFile(staging);
  }
}

// Best-effort cleanup of a staging file that failed verification or was
// already moved (moving updates `staging.uri`, so this is a harmless no-op
// in the success case).
export function discardStagedFile(staging: File): void {
  try {
    if (staging.exists) staging.delete();
  } catch {
    // Stale staging file — harmless, not worth surfacing.
  }
}

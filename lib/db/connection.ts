import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";
import migrations from "../../drizzle/migrations";

// Tune SQLite for a mobile expense-tracker workload: many small reads,
// infrequent writes, single-user. These run on every connection open and
// persist for the lifetime of the handle.
//   - cache_size: -4000 = 4 MB page cache (default ~2 MB). Keeps hot
//     category/source/config rows resident across queries.
//   - journal_mode: already WAL by default in expo-sqlite, but explicit
//     so restored backups from other SQLite builds inherit it.
//   - synchronous NORMAL: safe with WAL (fsync only on checkpoint, not
//     every commit). Cuts write latency ~50% vs FULL.
//   - temp_store MEMORY: temp tables and sort spill go to RAM instead of
//     disk. Safe for our dataset size.
function openConnection(): SQLite.SQLiteDatabase {
  const handle = SQLite.openDatabaseSync(DB_NAME);
  handle.execSync("PRAGMA cache_size = -4000;");
  handle.execSync("PRAGMA journal_mode = WAL;");
  handle.execSync("PRAGMA synchronous = NORMAL;");
  handle.execSync("PRAGMA temp_store = MEMORY;");
  return handle;
}

// Both `expo` (default export) and `db` are exported as live bindings so
// `reopenDatabase` can swap the underlying handle after a backup restore.
// Consumers must access members through the imported binding at call time
// (`db.select()`, `expo.execSync()`) and never alias either one at module
// scope — a module-scope alias would snapshot the pre-restore handle.
let expo = openConnection();
let db: ExpoSQLiteDatabase = drizzle(expo, { logger: __DEV__ });

/**
 * Run generated Drizzle migrations (from `drizzle/` directory).
 *
 * The migrator is a no-op when no migrations have been registered yet
 * (the stub in `drizzle/migrations.js` exports an empty journal). Once
 * `pnpm drizzle:generate` produces SQL files and they're wired into
 * `drizzle/migrations.js`, this will apply them in order on every boot.
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}

// Close the module-level handle before the DB file is replaced on disk
// (local import / cloud restore). Deleting the live file under an open
// handle leaves the old inode alive on POSIX — the handle keeps reading
// and writing the dead file. Safe to call when already closed.
export function closeDatabase(): void {
  try {
    expo.closeSync();
  } catch {
    // Already closed — nothing to release.
  }
}

// Re-open the connection after the DB file has been swapped on disk and
// point the drizzle instance at the fresh handle. Without this, migrations
// run against the deleted inode, queries keep serving pre-restore rows,
// and new writes are silently lost on next launch.
export function reopenDatabase(): void {
  closeDatabase();
  expo = openConnection();
  db = drizzle(expo, { logger: __DEV__ });
}

// Write a compacted point-in-time copy of the live DB to `destPath` (a
// plain POSIX path, not a file:// URI). Used instead of checkpoint + raw
// file copy for backups: `wal_checkpoint(TRUNCATE)` flushes pages but
// leaves the WAL flag stamped in the DB header, and
// `deserializeDatabaseAsync` (import preview) cannot open WAL-mode files
// (error 14). VACUUM INTO output is always rollback-journal mode, and it
// reads through this connection so pending WAL pages are included without
// a separate checkpoint. Fails if the target file already exists.
export function vacuumInto(destPath: string): void {
  // Path is interpolated into a single-quoted SQL string literal — escape
  // embedded quotes by doubling them.
  expo.execSync(`VACUUM INTO '${destPath.replace(/'/g, "''")}';`);
}

export { db, expo as default };

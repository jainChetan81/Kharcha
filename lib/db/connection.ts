import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";
import migrations from "../../drizzle/migrations";

const expo = SQLite.openDatabaseSync(DB_NAME);

// Tune SQLite for a mobile expense-tracker workload: many small reads,
// infrequent writes, single-user. These run once at connection open and
// persist for the lifetime of the process.
//   - cache_size: -4000 = 4 MB page cache (default ~2 MB). Keeps hot
//     category/source/config rows resident across queries.
//   - journal_mode: already WAL by default in expo-sqlite, but explicit
//     so restored backups from other SQLite builds inherit it.
//   - synchronous NORMAL: safe with WAL (fsync only on checkpoint, not
//     every commit). Cuts write latency ~50% vs FULL.
//   - temp_store MEMORY: temp tables and sort spill go to RAM instead of
//     disk. Safe for our dataset size.
expo.execSync("PRAGMA cache_size = -4000;");
expo.execSync("PRAGMA journal_mode = WAL;");
expo.execSync("PRAGMA synchronous = NORMAL;");
expo.execSync("PRAGMA temp_store = MEMORY;");

const db: ExpoSQLiteDatabase = drizzle(expo, { logger: __DEV__ });

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

// Flush the WAL into the main file before a copy/upload. Without this a
// raw .db copy can miss pages still in `<DB_NAME>-wal`, producing a
// snapshot that's missing the user's most recent writes.
export function checkpointWal(): void {
  try {
    expo.execSync("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    // Best-effort; a missed checkpoint degrades to the prior behaviour.
  }
}

export { db };
export default expo;

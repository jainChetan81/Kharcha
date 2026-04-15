import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import migrations from "../../drizzle/migrations";
import { DB_NAME } from "@/lib/constants";

const expo = SQLite.openDatabaseSync(DB_NAME);
const db: ExpoSQLiteDatabase = drizzle(expo, { logger: false });

/**
 * Run generated Drizzle migrations (from `drizzle/` directory).
 *
 * The migrator is a no-op when no migrations have been registered yet
 * (the stub in `drizzle/migrations.js` exports an empty journal). Once
 * `pnpm drizzle:generate` produces SQL files and they're wired into
 * `drizzle/migrations.js`, this will apply them in order on every boot.
 *
 * Errors from `migrate()` itself are NOT swallowed — a failing migration
 * is a real bug and must surface.
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}

export { db };
export default expo;

import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";
import migrations from "../../drizzle/migrations";

const expo = SQLite.openDatabaseSync(DB_NAME);
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

export { db };
export default expo;

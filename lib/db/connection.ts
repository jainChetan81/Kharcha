import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SQLite from "expo-sqlite";
import migrations from "@/drizzle/migrations";
import { DB_NAME } from "@/lib/constants";

const expo = SQLite.openDatabaseSync(DB_NAME);
const db: ExpoSQLiteDatabase = drizzle(expo, { logger: __DEV__ });

export async function runMigrations() {
  await migrate(db, migrations);
}

export { db };
export default expo;

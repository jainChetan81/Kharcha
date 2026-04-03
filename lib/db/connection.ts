import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import { DB_NAME } from "@/lib/constants";

const expo = SQLite.openDatabaseSync(DB_NAME);
const db: ExpoSQLiteDatabase = drizzle(expo, { logger: false });

export { db };
export default expo;

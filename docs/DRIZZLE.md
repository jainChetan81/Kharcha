# Drizzle ORM & Migrations

This doc covers database schema management with Drizzle ORM and migrations for SQLite on Expo.

## Overview

- **Schema Definition**: `lib/db/schema.ts` — 8 tables (categories, sources, transactions, subscriptions, budgets, banks, bank_emails, config) using Drizzle table factories
- **Migration Storage**: `drizzle/` — generated SQL migration files + metadata
- **Connection**: `lib/db/connection.ts` — SQLite connection + migration runner
- **Initialization**: `lib/db/index.ts` — `initDB()` runs migrations + seeds defaults
- **Types**: `lib/db/types.ts` — shared types (TransactionRow, etc.)
- **Migration Tooling**: `drizzle-kit` (v0.31.10) — schema introspection + migration generation
- **Commands**:
  - `pnpm drizzle:generate` — generate migration from schema changes
  - `pnpm drizzle:studio` — open web UI to inspect + edit database

---

## Workflow

### 1. Modify Schema

Edit `lib/db/schema.ts`:

```typescript
// lib/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: real("amount").notNull(),
  // Add new column:
  tags: text("tags"), // JSON array stored as text
  // ...
});
```

### 2. Generate Migration

```bash
pnpm drizzle:generate
```

This introspects your schema and generates SQL migration(s):
- `drizzle/0001_add_tags.sql` — new migration file
- `drizzle/meta/_journal.json` — version tracking
- `drizzle/migrations.js` — auto-updated with new migration

**What to commit:**
- ✅ `lib/db/schema.ts` (schema definition)
- ✅ `drizzle/*.sql` (migration SQL)
- ✅ `drizzle/meta/` (migration metadata)
- ✅ `drizzle/migrations.js` (migration registry)

### 3. Migration Runs Automatically on App Startup

There are **two migration strategies** that both run on every app launch. They serve different purposes and must be kept in sync.

#### Strategy A: Drizzle Migrations (`lib/db/connection.ts`)

```typescript
export async function runMigrations() {
  await migrate(db, migrations);
}
```

Runs generated SQL files from `drizzle/` in order. This is the primary migration mechanism for schema changes tracked by `drizzle-kit`.

#### Strategy B: Inline `CREATE TABLE IF NOT EXISTS` (`lib/db/index.ts`)

```typescript
export async function initDB() {
  // Inline CREATE TABLE IF NOT EXISTS for each table
  await db.run(sql`CREATE TABLE IF NOT EXISTS categories (...)`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS transactions (...)`);
  // ... etc

  await seedDefaults();
}
```

These raw SQL statements act as a **safety net** for fresh installs where Drizzle migrations may not have been generated yet (e.g., during early development or if `drizzle/` is missing). Since they use `CREATE TABLE IF NOT EXISTS`, they are no-ops if the tables already exist from Drizzle migrations.

#### Both must be kept in sync

When the Drizzle schema (`lib/db/schema.ts`) changes, the inline `CREATE TABLE` statements in `initDB()` must also be updated to match. If they drift, fresh installs (which hit the `CREATE TABLE IF NOT EXISTS` path first) will create tables missing the new columns, and subsequent Drizzle migrations may fail or produce inconsistent state.

**Example of drift**: The `gmail_message_id` column was added to `transactions` in `lib/db/schema.ts` and in a Drizzle migration, but was initially missing from the inline `CREATE TABLE IF NOT EXISTS` in `initDB()`. This meant fresh installs created the transactions table without `gmail_message_id`, causing gmail sync to fail.

#### Startup sequence

Both strategies run on every app launch via `app/_layout.tsx`:

```typescript
useEffect(() => {
  initDB().catch(console.error);
}, []);
```

Inside `initDB()`, the inline `CREATE TABLE IF NOT EXISTS` statements run first (creating tables if they don't exist), then Drizzle migrations apply any pending schema changes on top.

**Result**: Database schema stays in sync across all devices automatically.

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/db/schema.ts` | Drizzle table definitions (8 tables) |
| `lib/db/types.ts` | Shared types (TransactionRow, etc.) |
| `lib/db/connection.ts` | SQLite connection + migration runner |
| `lib/db/index.ts` | Database initialization + seeds |
| `lib/db/banks.ts` | Bank + bank_emails CRUD |
| `lib/db/backup.ts` | Export/import full database as JSON |
| `drizzle.config.ts` | Drizzle CLI config |
| `drizzle/0000_*.sql` | Generated migration SQL (one per change) |
| `drizzle/migrations.js` | Migration registry (auto-updated) |
| `drizzle/meta/_journal.json` | Migration tracking metadata |

---

## Migration Metadata

The `drizzle/meta/` folder tracks:
- Which migrations have been created
- Timestamps of migration generations
- Ensures migrations run in correct order

Never edit this manually — `pnpm drizzle:generate` handles it.

---

## Best Practices

### ✅ DO

- **Keep schema in version control**: `lib/db/schema.ts` should be committed
- **Keep migrations in version control**: All `drizzle/*.sql` + `migrations.js`
- **Generate migrations after schema changes**: Always run `pnpm drizzle:generate`
- **Update inline CREATE TABLE statements in `initDB()` when schema changes**: Keep them in sync with `lib/db/schema.ts` to avoid drift on fresh installs
- **Use `onConflictDoNothing()` for idempotent seeds**: Prevents duplicate inserts if app restarts
- **Test migrations locally**: Run `pnpm ios` with schema changes to verify migrations work

### ❌ DON'T

- **Don't edit migrations manually**: Let `drizzle-kit generate` create them
- **Don't edit `migrations.js`**: It's auto-generated
- **Don't ignore `drizzle/` folder**: Migrations must be committed
- **Don't run migrations directly**: They're run automatically on app launch via `initDB()`

---

## Typical Development Flow

```bash
# 1. Edit schema
vim lib/db/schema.ts

# 2. Generate migration
pnpm drizzle:generate

# 3. Test locally
pnpm ios
# ... verify app works, data persists

# 4. Commit
git add lib/db/schema.ts drizzle/
git commit -m "feat: add tags to transactions"

# 5. Push
git push origin feature-branch
```

**On team members' machines**: When they pull, `initDB()` automatically runs any new migrations on next app launch. ✅ No manual steps needed.

---

## Inspecting Database (Development)

```bash
pnpm drizzle:studio
```

Opens interactive web UI to:
- Browse tables and data
- Create/edit/delete records
- Write SQL queries
- Export data

Great for debugging! 🔍

---

## Troubleshooting

### Migration fails on app startup

**Symptom**: App crashes with migration error

**Solution**:
1. Check SQLite logs: `console.error()` output
2. Verify `lib/db/connection.ts` has correct imports
3. Run `pnpm drizzle:generate` again (regenerate migrations)
4. Wipe app data and retry on simulator

### Migrations don't apply after pull

**Symptom**: Pulled new schema changes, but migrations don't run

**Solution**:
1. Verify `drizzle/` folder is committed and pulled
2. Kill app from simulator (Cmd+Q)
3. Restart app — migrations run on first launch
4. Or manually call `initDB()` in dev console

### Migration SQL looks wrong

**Symptom**: Generated SQL doesn't match schema changes

**Solution**:
1. Check `lib/db/schema.ts` for typos
2. Run `pnpm drizzle:generate` again
3. Review generated `drizzle/0000_*.sql` before committing
4. Adjust `drizzle.config.ts` if needed (casing, dialect config)

---

## Adding New Tables

```typescript
// lib/db/schema.ts
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});
```

Then:
```bash
pnpm drizzle:generate
```

This creates migration + updates `migrations.js` automatically. Commit and deploy! 🚀

---

## Column Constraints

Drizzle supports all SQLite constraints:

```typescript
export const example = sqliteTable("example", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  category_id: integer("category_id").references(() => categories.id),
  amount: real("amount").notNull().default(0),
  created_at: text("created_at").default("(datetime('now'))"),
  is_active: integer("is_active").default(1), // SQLite uses 0/1 for booleans
});
```

After changes, just run `pnpm drizzle:generate` → migrations are created automatically. ✅

---

## Version Tracking & Upgrades

### Overview

The app tracks versions in the `config` table to detect upgrades and run version-specific logic:

- **`APP_VERSION`** — Current app version (from `package.json`)
- **`SCHEMA_VERSION`** — Schema version (tracks DB schema changes)

Both are stored in `lib/constants.ts` `CONFIG_KEYS`.

### Upgrade Detection

In `lib/db/index.ts`, on each app startup:

```typescript
const previousVersion = await getConfigValue(CONFIG_KEYS.APP_VERSION);
const hasUpgrade = isUpgrade(previousVersion);

// Seed defaults only on first boot
if (!previousVersion) {
  await seedDefaults();
}

if (hasUpgrade && previousVersion) {
  console.info(`[DB] Upgraded from ${previousVersion} to ${APP_VERSION}`);
}
```

### Version Comparison

`lib/version.ts` provides helpers:

```typescript
import { compareVersions, isUpgrade, isMajorUpgrade, APP_VERSION } from "@/lib/version";

compareVersions("1.0.0", "1.1.0"); // -1 (first is older)
compareVersions("1.2.0", "1.1.0"); // 1 (first is newer)

isUpgrade("0.9.0"); // true — upgrade needed
isUpgrade("1.0.0"); // false — same version

isMajorUpgrade("0.9.0"); // true — 0→1 is major
isMajorUpgrade("1.0.0"); // false — 1→1 is not major
```

### Handling Version-Specific Logic

For breaking changes or data transformations during upgrades:

```typescript
// lib/db/index.ts
export async function initDB() {
  await runMigrations();

  const previousVersion = await getConfigValue(CONFIG_KEYS.APP_VERSION);

  // Handle v1.0.0 -> v1.1.0 upgrade (added tags column)
  if (previousVersion && compareVersions(previousVersion, "1.1.0") < 0) {
    await migrateToV1_1_0();
  }

  // Handle major version upgrade (v1 -> v2)
  if (isMajorUpgrade(previousVersion)) {
    console.warn("[DB] Major upgrade detected!");
    // Run any critical data transformations
  }

  await seedDefaults(); // Idempotent
}

async function migrateToV1_1_0() {
  console.info("[DB] Running v1.1.0 upgrade tasks...");
  // Any JS-level data transformation (if migration SQL isn't enough)
  // E.g., backfill new columns, rename fields, etc.
}
```

### Release Checklist

When releasing a new version:

1. **Update version** in `app.json` and `package.json`
2. **Update `CHANGELOG.md`** with changes
3. **Generate migrations** if schema changed: `pnpm drizzle:generate`
4. **Document breaking changes** in CHANGELOG's "Migration Guide"
5. **Add version-specific upgrade logic** if needed in `lib/db/index.ts`
6. **Test locally**: `pnpm ios` with new version
7. **Commit & tag**: `git tag v1.2.0 && git push origin v1.2.0`

**Result**: ✅ App automatically detects upgrades + runs migrations on next launch.




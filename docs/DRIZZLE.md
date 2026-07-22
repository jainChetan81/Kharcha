# Drizzle ORM & Migrations

This doc covers database schema management with Drizzle ORM and migrations for SQLite on Expo.

## Overview

- **Schema Definition**: `lib/db/schema.ts` — 11 tables (categories, sources, transactions, subscriptions, holdings, budgets, banks, bank_emails, config, tags, transaction_tags) using Drizzle table factories
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
import migrations from "../../drizzle/migrations";

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}
```

Runs generated SQL files from `drizzle/` in order. This is the primary migration mechanism for schema changes tracked by `drizzle-kit`. The `drizzle/migrations.js` file is hand-maintained: after each `pnpm drizzle:generate` run, add the new SQL import to its `migrations` map. Until the first migration is registered it exports an empty journal, so `migrate()` is a no-op and the inline `CREATE TABLE IF NOT EXISTS` path in `initDB()` keeps the app bootable. Errors from `migrate()` itself are **not** swallowed.

Metro bundles `.sql` files as strings via `metro.config.js` (`config.resolver.sourceExts.push("sql")`).

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

#### Column back-fills use `PRAGMA table_info`, not `try/catch`

For columns added after an initial `CREATE TABLE`, `initDB()` uses a `hasColumn(table, column)` helper backed by `PRAGMA table_info(...)` to decide whether to run `ALTER TABLE ADD COLUMN`. The previous pattern — wrapping `ALTER` in `try { ... } catch {}` — silently swallowed every error, not just "duplicate column": FK violations, lock contention, and syntax errors all looked the same. The explicit check means real errors surface.

#### Restore-from-backup re-runs `initDB()`

An old backup (older schema) imported into a new app must be brought up to the current schema before the UI queries it. Both `importDatabase()` (local `.db` file) and `restoreFromCloud()` (iCloud / Drive) trigger `initDB()` again after the file is in place — this applies any pending Drizzle migrations and back-fills missing columns before `queryClient.invalidateQueries()` refetches everything. Users no longer need to restart the app manually after a restore.

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
| `lib/db/schema.ts` | Drizzle table definitions (11 tables) |
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

## Schema Upgrades (How It Actually Works)

There is no app-version comparison machinery. Schema evolution is handled entirely inside `initDB()` (`lib/db/index.ts`), which runs on every launch:

1. Inline `CREATE TABLE IF NOT EXISTS` statements create all tables (fresh-install safety net).
2. A `hasColumn`-guarded `ALTER TABLE ... ADD COLUMN` chain backfills every column added since v1 (idempotent — no-ops if the column exists).
3. Drizzle migrations apply on top.
4. `seedDefaults()` runs idempotently.

So both fresh installs and upgrades converge on the same schema without tracking version numbers. When you change the schema: edit `lib/db/schema.ts`, run `pnpm drizzle:generate`, keep the inline DDL + `hasColumn` chain in sync (see [Workflow](#workflow) above).

For release/versioning process, see `docs/RELEASE.md` and the `bump-version` skill.




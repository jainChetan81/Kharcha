// Drizzle migrations registry for expo-sqlite.
//
// On first schema change, run:
//     pnpm drizzle:generate
//
// …which will create `drizzle/0000_*.sql` + `drizzle/meta/`. After each
// generate, add the new SQL file to the `migrations` map below so the
// expo-sqlite migrator picks it up.
//
// Example after generating `0000_initial.sql`:
//     import m0000 from "./0000_initial.sql";
//     import journal from "./meta/_journal.json";
//     export default {
//       journal,
//       migrations: { m0000 },
//     };
//
// Until the first migration exists we export an empty journal so the
// migrator is a safe no-op and the app falls through to the inline
// CREATE TABLE IF NOT EXISTS safety net in `lib/db/index.ts`.

export default {
  journal: {
    version: "7",
    dialect: "sqlite",
    entries: [],
  },
  migrations: {},
};

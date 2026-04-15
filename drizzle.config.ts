import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "expo",
  casing: "snake_case",
} satisfies Config;

import type { Config } from "drizzle-kit";

export default {
	schema: "./lib/db/schema.ts",
	dialect: "sqlite",
	driver: "expo",
	casing: "snake_case"
} satisfies Config;

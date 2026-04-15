type Prettify<T> = { [K in keyof T]: T[K] } & {};

// Drizzle migrations bundle — hand-maintained in `drizzle/migrations.js`,
// typed here so `connection.ts` can import it under strict TS.
declare module "*/drizzle/migrations" {
  const migrations: {
    journal: {
      version: string;
      dialect: string;
      entries: Array<{
        idx: number;
        version: string;
        when: number;
        tag: string;
        breakpoints: boolean;
      }>;
    };
    migrations: Record<string, string>;
  };
  export default migrations;
}

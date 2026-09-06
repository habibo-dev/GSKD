import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import type { PgDatabase } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Support de deux moteurs :
//   1. PostgreSQL externe (production / tests) : DATABASE_URL=postgres://...
//   2. PGlite embarqué (démo locale sans serveur) : DATABASE_URL=pglite://
// Le schéma est créé par `npm run db:setup` (src/db/setup.ts) / bootstrap.
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL ?? "";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPglite?: PGlite;
};

export let pool: Pool | null = null;
export let pglite: PGlite | null = null;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Ex: postgres://user:pass@host/db (production) or pglite://local (demo).",
  );
}

let db: PgDatabase<any, any, any>;

if (databaseUrl.startsWith("pglite://")) {
  const dataDir =
    databaseUrl.replace(/^pglite:\/\//, "").trim() || undefined;
  pglite =
    globalForDb.__arenaNextJsPglite ?? new PGlite(dataDir || ":memory:");
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPglite = pglite;
  }
  db = pgliteDrizzle(pglite);
} else {
  pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }
  db = drizzle(pool);
}

export { db };

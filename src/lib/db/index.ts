import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/persistence";
import { runtimeEnv } from "@/lib/env/runtime";

const globalForDb = global as unknown as {
  pool: Pool | undefined;
};

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: runtimeEnv.databaseUrl,
    max: runtimeEnv.databasePoolMax,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  });

globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export const databasePool = pool;

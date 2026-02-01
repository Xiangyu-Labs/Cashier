import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Singleton pattern for database connection to prevent multiple instances
// during hot-reloading in development.
// See: https://github.com/vercel/next.js/issues/7811#issuecomment-715259370
const globalForDb = global as unknown as {
    conn: postgres.Sql | undefined;
};

const client = globalForDb.conn ?? postgres(connectionString);

if (process.env.NODE_ENV !== "production") {
    globalForDb.conn = client;
}

export const db = drizzle(client, { schema });


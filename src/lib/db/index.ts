import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

import * as schema from "./schema";

const sqlitePath = (process.env.DATABASE_URL || "sqlite.db").replace(/^file:/, "");

// Singleton pattern for database connection
const globalForDb = global as unknown as {
    conn: Database.Database | undefined;
};

const client = globalForDb.conn ?? new Database(sqlitePath);

if (process.env.NODE_ENV !== "production") {
    globalForDb.conn = client;
}

export const db = drizzle(client, { schema });


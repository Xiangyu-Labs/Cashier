import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "@/persistence";
import { runtimeEnv } from "@/lib/env/runtime";

const sqlitePath = runtimeEnv.databaseUrl.replace(/^file:/, "");

if (sqlitePath !== ":memory:") {
  mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

// Singleton pattern for database connection
const globalForDb = global as unknown as {
  conn: Database.Database | undefined;
};

const client =
  globalForDb.conn ??
  new Database(sqlitePath, {
    timeout: 5000, // 5 second timeout
  });

// Configure SQLite PRAGMA for performance and data integrity
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");
client.pragma("synchronous = NORMAL");
client.pragma("busy_timeout = 5000");

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = client;
}

export const db = drizzle(client, { schema });

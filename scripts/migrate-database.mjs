#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolveDatabasePath } from "./production-data-inventory.mjs";
import { runApplicationLayerBackfill } from "./migrations/application-layer-backfill.mjs";

function loadLocalEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

async function main() {
  loadLocalEnvironment();
  const databasePath = resolveDatabasePath(process.env.DATABASE_URL ?? "file:./data/sqlite.db");
  const uploadsPath = path.resolve(process.env.LOCAL_STORAGE_PATH ?? "./data/uploads");
  const migrationsFolder = path.resolve("src/persistence/migrations");

  mkdirSync(path.dirname(databasePath), { recursive: true });
  mkdirSync(uploadsPath, { recursive: true });

  const client = new Database(databasePath);
  try {
    client.pragma("busy_timeout = 5000");
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    await migrate(drizzle(client), { migrationsFolder });
    const backfill = runApplicationLayerBackfill({ db: client, uploadsPath });
    console.log(
      JSON.stringify(
        {
          mode: "migrate",
          database: "sqlite",
          schemaMigrations: "complete",
          backfill,
        },
        null,
        2
      )
    );
  } finally {
    client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[db:migrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

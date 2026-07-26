#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.resolve(process.cwd(), filename);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

async function main() {
  loadLocalEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (connectionString == null || !/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve("src/persistence/postgres-migrations"),
    });
    console.log(JSON.stringify({ mode: "migrate", database: "postgresql", status: "complete" }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[db:migrate] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

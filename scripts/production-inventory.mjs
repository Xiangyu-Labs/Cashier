#!/usr/bin/env node
import { collectProductionInventory } from "./production-data-inventory.mjs";

function parseArgs(argv) {
  const options = {
    database: process.env.DATABASE_URL ?? "file:./data/sqlite.db",
    uploads: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database") options.database = argv[++index];
    else if (arg === "--uploads") options.uploads = argv[++index];
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (typeof options.database !== "string" || typeof options.uploads !== "string") {
    throw new Error("--database and --uploads require values");
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: npm run ops:inventory -- [--database file:./data/sqlite.db] [--uploads ./data/uploads]"
    );
    process.exit(0);
  }
  console.log(
    JSON.stringify(
      collectProductionInventory({ databasePath: options.database, uploadsPath: options.uploads }),
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

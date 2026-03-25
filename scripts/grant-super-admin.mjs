#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

function readDatabaseUrlFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (match == null) {
    return null;
  }

  const value = match[1]?.trim();
  return value != null && value !== "" ? value : null;
}

export function resolveDatabaseUrl({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit != null && explicit !== "") {
    return explicit;
  }

  const fromEnvLocal = readDatabaseUrlFromEnvFile(path.join(cwd, ".env.local"));
  if (fromEnvLocal != null) {
    return fromEnvLocal;
  }

  const fromEnv = readDatabaseUrlFromEnvFile(path.join(cwd, ".env"));
  if (fromEnv != null) {
    return fromEnv;
  }

  return "file:./data/sqlite.db";
}

export function resolveSqlitePath(databaseUrl, cwd = process.cwd()) {
  if (/^[a-z]+:\/\//i.test(databaseUrl) && !databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for this script: ${databaseUrl}`);
  }

  const normalized = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
}

export function grantSuperAdminByEmail({ dbPath, email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = new Database(dbPath);

  try {
    const columns = db.prepare("PRAGMA table_info(users)").all();
    const hasRoleColumn = columns.some((column) => column.name === "role");
    if (!hasRoleColumn) {
      throw new Error("users.role column not found. Run `npm run db:migrate` first.");
    }

    const result = db
      .prepare("UPDATE users SET role = 'super_admin' WHERE email = ?")
      .run(normalizedEmail);

    if (result.changes === 0) {
      throw new Error(`No user found for email: ${normalizedEmail}`);
    }

    return db
      .prepare("SELECT id, email, role FROM users WHERE email = ?")
      .get(normalizedEmail);
  } finally {
    db.close();
  }
}

function printUsage() {
  console.error("Usage: npm run admin:grant-super-admin -- <email>");
}

async function main() {
  const email = process.argv[2];
  if (email == null || email.trim() === "") {
    printUsage();
    process.exit(1);
  }

  const databaseUrl = resolveDatabaseUrl();
  const dbPath = resolveSqlitePath(databaseUrl);
  const user = grantSuperAdminByEmail({ dbPath, email });

  console.log(`Granted super_admin to ${user.email}`);
  console.log(JSON.stringify(user, null, 2));
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] != null && path.resolve(process.argv[1]) === currentFilePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

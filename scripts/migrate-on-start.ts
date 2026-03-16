#!/usr/bin/env tsx
/**
 * 启动时自动执行图片迁移
 *
 * 在 docker-entrypoint.sh 中调用，在 db:migrate 之后执行
 */

import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Load env first - prefer .env.local, fallback to .env
const envLocalPath = resolve(projectRoot, ".env.local");
const envPath = resolve(projectRoot, ".env");
config({ path: existsSync(envLocalPath) ? envLocalPath : envPath });

// Convert relative database path to absolute path (关键！)
const dbUrl = process.env.DATABASE_URL || "file:./data/sqlite.db";
if (dbUrl.startsWith("file:./") || dbUrl.startsWith("file:")) {
    const dbPath = dbUrl.replace(/^file:/, "");
    process.env.DATABASE_URL = resolve(projectRoot, dbPath);
}

console.log("[MIGRATION] Database path:", process.env.DATABASE_URL);
console.log("[MIGRATION] Local storage path:", process.env.LOCAL_STORAGE_PATH || "./data/uploads");

// Now import db after env is properly set
const { migrateImagesToLocal } = await import("@/lib/db/migrate-images");

console.log("[MIGRATION] Starting image migration check...");

migrateImagesToLocal()
  .then((stats) => {
    console.log("[MIGRATION] Image migration completed:");
    console.log(`  - Total images checked: ${stats.totalImages}`);
    console.log(`  - Migrated from Base64: ${stats.migratedFromBase64}`);
    console.log(`  - Migrated from R2: ${stats.migratedFromR2}`);
    console.log(`  - Already local: ${stats.alreadyLocal}`);
    console.log(`  - Failed: ${stats.failedImages}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error("[MIGRATION] Image migration failed:", error);
    process.exit(0);
  });

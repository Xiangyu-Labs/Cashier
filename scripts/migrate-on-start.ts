#!/usr/bin/env tsx
/**
 * 启动时自动执行图片迁移
 *
 * 在 docker-entrypoint.sh 中调用，在 db:migrate 之后执行
 */

import { migrateImagesToLocal } from "@/lib/db/migrate-images";

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
    // 不退出，让应用继续启动
    process.exit(0);
  });

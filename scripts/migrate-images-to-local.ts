#!/usr/bin/env tsx
/**
 * 迁移现有图片到本地存储
 *
 * 支持迁移类型：
 * 1. Base64 数据库中的图片 - 直接解码保存
 * 2. R2 存储的图片 - 从 R2 下载后保存
 *
 * 使用方法：
 *   npm run migrate:local:dry-run    # 预览模式，不实际写入
 *   npm run migrate:local            # 执行迁移
 */

import { db } from "@/lib/db";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { getLocalStorage } from "@/lib/storage/local";
import { base64ToBuffer, isBase64Url, isHttpUrl } from "@/lib/storage/index";
import { logger } from "@/lib/logger";
import { isNull, eq } from "drizzle-orm";

interface MigrationStats {
  totalDocuments: number;
  processedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  totalImages: number;
  migratedFromBase64: number;
  migratedFromR2: number;
  alreadyLocal: number;
  failedImages: number;
}

async function downloadFromR2(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Cashier-Migration/1.0" },
    });

    if (!response.ok) {
      logger.error({ url, status: response.status }, "Failed to download from R2");
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return { buffer, mimeType: contentType };
  } catch (error) {
    logger.error({ error, url }, "Error downloading from R2");
    return null;
  }
}

function inferMimeType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'avif': 'image/avif',
  };
  return mimeTypes[ext || ''] || 'image/jpeg';
}

async function migrateImagesToLocal(dryRun: boolean): Promise<MigrationStats> {
  const storage = getLocalStorage();
  const stats: MigrationStats = {
    totalDocuments: 0,
    processedDocuments: 0,
    skippedDocuments: 0,
    failedDocuments: 0,
    totalImages: 0,
    migratedFromBase64: 0,
    migratedFromR2: 0,
    alreadyLocal: 0,
    failedImages: 0,
  };

  const docs = await db.query.sourceDocuments.findMany({
    where: isNull(sourceDocuments.deletedAt),
  });

  stats.totalDocuments = docs.length;
  logger.info({ totalDocuments: docs.length }, "Starting migration");

  for (const doc of docs) {
    const imageUrls = doc.imageUrls as string[];
    if (!imageUrls || imageUrls.length === 0) {
      stats.skippedDocuments++;
      continue;
    }

    const newUrls: string[] = [];
    let hasChanges = false;

    for (const url of imageUrls) {
      stats.totalImages++;

      if (url.startsWith('/api/uploads/')) {
        newUrls.push(url);
        stats.alreadyLocal++;
        continue;
      }

      if (isBase64Url(url)) {
        try {
          const { buffer, mimeType } = base64ToBuffer(url);
          const ext = mimeType.split('/')[1] || 'jpg';
          const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

          if (!dryRun) {
            const newUrl = await storage.upload(key, buffer, mimeType);
            newUrls.push(newUrl);
          } else {
            newUrls.push(`/api/uploads/${key}`);
          }

          stats.migratedFromBase64++;
          hasChanges = true;
        } catch (error) {
          logger.error({ error, docId: doc.id }, "Failed to migrate base64 image");
          newUrls.push(url);
          stats.failedImages++;
        }
        continue;
      }

      if (isHttpUrl(url)) {
        try {
          const downloaded = await downloadFromR2(url);
          if (!downloaded) {
            newUrls.push(url);
            stats.failedImages++;
            continue;
          }

          const mimeType = downloaded.mimeType;
          const ext = mimeType.split('/')[1] || inferMimeType(url);
          const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

          if (!dryRun) {
            const newUrl = await storage.upload(key, downloaded.buffer, mimeType);
            newUrls.push(newUrl);
          } else {
            newUrls.push(`/api/uploads/${key}`);
          }

          stats.migratedFromR2++;
          hasChanges = true;
        } catch (error) {
          logger.error({ error, docId: doc.id }, "Failed to migrate R2 image");
          newUrls.push(url);
          stats.failedImages++;
        }
        continue;
      }

      logger.warn({ docId: doc.id, url: url.substring(0, 50) }, "Unknown URL format");
      newUrls.push(url);
    }

    if (hasChanges && !dryRun) {
      try {
        await db
          .update(sourceDocuments)
          .set({ imageUrls: newUrls })
          .where(eq(sourceDocuments.id, doc.id));
        stats.processedDocuments++;
      } catch (error) {
        logger.error({ error, docId: doc.id }, "Failed to update document");
        stats.failedDocuments++;
      }
    } else if (hasChanges) {
      stats.processedDocuments++;
    }
  }

  return stats;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=============================================");
  console.log("  图片迁移工具: 迁移到本地存储");
  console.log("=============================================");

  if (dryRun) {
    console.log("⚠️  预览模式 (dry-run): 不会实际修改数据");
  }

  const stats = await migrateImagesToLocal(dryRun);

  console.log();
  console.log("迁移统计:");
  console.log(`  总文档数:        ${stats.totalDocuments}`);
  console.log(`  处理文档数:      ${stats.processedDocuments}`);
  console.log(`  跳过(无图片):    ${stats.skippedDocuments}`);
  console.log(`  失败文档数:      ${stats.failedDocuments}`);
  console.log();
  console.log(`  总图片数:        ${stats.totalImages}`);
  console.log(`  ├─ Base64 迁移:  ${stats.migratedFromBase64}`);
  console.log(`  ├─ R2 迁移:      ${stats.migratedFromR2}`);
  console.log(`  ├─ 已是本地:     ${stats.alreadyLocal}`);
  console.log(`  └─ 失败:         ${stats.failedImages}`);

  if (dryRun) {
    console.log();
    console.log("💡 这是预览模式。要执行实际迁移，运行:");
    console.log("   npm run migrate:local");
  }
}

main().catch((error) => {
  logger.error({ error }, "Migration failed");
  process.exit(1);
});

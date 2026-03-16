/**
 * 启动时图片迁移 - 将 base64/R2 图片迁移到本地存储
 *
 * 在应用启动时自动执行，检查并迁移现有图片
 */

import { db } from "@/lib/db";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { getLocalStorage } from "@/lib/storage/local";
import { base64ToBuffer, isBase64Url, isHttpUrl } from "@/lib/storage/index";
import { logger } from "@/lib/logger";
import { isNull, eq } from "drizzle-orm";

interface MigrationStats {
  totalImages: number;
  migratedFromBase64: number;
  migratedFromR2: number;
  alreadyLocal: number;
  failedImages: number;
}

let migrationRunning = false;

/**
 * 从 R2 URL 下载图片
 */
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

/**
 * 从 URL 推断 MIME 类型
 */
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

/**
 * 执行图片迁移
 *
 * 在应用启动时调用，自动将 base64 和 R2 图片迁移到本地存储
 */
export async function migrateImagesToLocal(): Promise<MigrationStats> {
  if (migrationRunning) {
    logger.info("Image migration already in progress, skipping");
    return {
      totalImages: 0,
      migratedFromBase64: 0,
      migratedFromR2: 0,
      alreadyLocal: 0,
      failedImages: 0,
    };
  }

  migrationRunning = true;
  logger.info("Starting image migration to local storage...");

  const storage = getLocalStorage();
  const stats: MigrationStats = {
    totalImages: 0,
    migratedFromBase64: 0,
    migratedFromR2: 0,
    alreadyLocal: 0,
    failedImages: 0,
  };

  try {
    // 查找所有源文档
    const docs = await db.query.sourceDocuments.findMany({
      where: isNull(sourceDocuments.deletedAt),
    });

    logger.info({ totalDocuments: docs.length }, "Found documents to check");

    let processedCount = 0;

    for (const doc of docs) {
      const imageUrls = doc.imageUrls as string[];
      if (!imageUrls || imageUrls.length === 0) {
        continue;
      }

      const newUrls: string[] = [];
      let hasChanges = false;

      for (const url of imageUrls) {
        stats.totalImages++;

        // 1. 已经是本地 URL，跳过
        if (url.startsWith('/api/uploads/')) {
          newUrls.push(url);
          stats.alreadyLocal++;
          continue;
        }

        // 2. Base64 图片 - 解码并保存
        if (isBase64Url(url)) {
          try {
            const { buffer, mimeType } = base64ToBuffer(url);
            const ext = mimeType.split('/')[1] || 'jpg';
            const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

            const newUrl = await storage.upload(key, buffer, mimeType);
            newUrls.push(newUrl);
            logger.debug({ docId: doc.id, key }, "Migrated base64 image");

            stats.migratedFromBase64++;
            hasChanges = true;
          } catch (error) {
            logger.error({ error, docId: doc.id }, "Failed to migrate base64 image");
            newUrls.push(url); // 保留原 URL
            stats.failedImages++;
          }
          continue;
        }

        // 3. R2/HTTP 图片 - 下载并保存
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

            const newUrl = await storage.upload(key, downloaded.buffer, mimeType);
            newUrls.push(newUrl);
            logger.debug({ docId: doc.id, key }, "Migrated R2 image");

            stats.migratedFromR2++;
            hasChanges = true;
          } catch (error) {
            logger.error({ error, docId: doc.id }, "Failed to migrate R2 image");
            newUrls.push(url);
            stats.failedImages++;
          }
          continue;
        }

        // 未知的 URL 格式，保留
        logger.warn({ docId: doc.id, url: url.substring(0, 50) }, "Unknown URL format");
        newUrls.push(url);
      }

      // 更新数据库
      if (hasChanges) {
        try {
          await db
            .update(sourceDocuments)
            .set({ imageUrls: newUrls })
            .where(eq(sourceDocuments.id, doc.id));
          processedCount++;
        } catch (error) {
          logger.error({ error, docId: doc.id }, "Failed to update document");
        }
      }
    }

    logger.info({
      ...stats,
      processedDocuments: processedCount,
    }, "Image migration completed");

  } catch (error) {
    logger.error({ error }, "Image migration failed");
  } finally {
    migrationRunning = false;
  }

  return stats;
}

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

// R2 下载并发控制
let r2DownloadsInProgress = 0;
const MAX_R2_CONCURRENT = 3;

/**
 * 从 R2 URL 下载图片（带并发限制）
 */
async function downloadFromR2(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // 等待有空闲槽位
  while (r2DownloadsInProgress >= MAX_R2_CONCURRENT) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  r2DownloadsInProgress++;
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
  } finally {
    r2DownloadsInProgress--;
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
 * 批量并发处理控制
 * @param items 待处理项数组
 * @param fn 处理函数
 * @param concurrency 并发数
 */
async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
  }
  return results;
}

/**
 * 处理单个文档的图片迁移
 */
async function processDocument(
  doc: typeof sourceDocuments.$inferSelect,
  storage: ReturnType<typeof getLocalStorage>,
  stats: MigrationStats
): Promise<{ docId: string; newUrls: string[]; hasChanges: boolean } | null> {
  const imageUrls = doc.imageUrls as string[];
  if (!imageUrls || imageUrls.length === 0) {
    return null;
  }

  const newUrls: string[] = [];
  let hasChanges = false;

  // 并行处理文档内的所有图片
  const processImage = async (url: string): Promise<string> => {
    stats.totalImages++;

    // 1. 已经是本地 URL，跳过
    if (url.startsWith('/api/uploads/')) {
      stats.alreadyLocal++;
      return url;
    }

    // 2. Base64 图片 - 解码并保存
    if (isBase64Url(url)) {
      try {
        const { buffer, mimeType } = base64ToBuffer(url);
        const ext = mimeType.split('/')[1] || 'jpg';
        const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

        const newUrl = await storage.upload(key, buffer, mimeType);
        logger.debug({ docId: doc.id, key }, "Migrated base64 image");
        stats.migratedFromBase64++;
        return newUrl;
      } catch (error) {
        logger.error({ error, docId: doc.id }, "Failed to migrate base64 image");
        stats.failedImages++;
        return url;
      }
    }

    // 3. R2/HTTP 图片 - 下载并保存
    if (isHttpUrl(url)) {
      try {
        const downloaded = await downloadFromR2(url);
        if (!downloaded) {
          stats.failedImages++;
          return url;
        }

        const mimeType = downloaded.mimeType;
        const ext = mimeType.split('/')[1] || inferMimeType(url);
        const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

        const newUrl = await storage.upload(key, downloaded.buffer, mimeType);
        logger.debug({ docId: doc.id, key }, "Migrated R2 image");
        stats.migratedFromR2++;
        return newUrl;
      } catch (error) {
        logger.error({ error, docId: doc.id }, "Failed to migrate R2 image");
        stats.failedImages++;
        return url;
      }
    }

    // 未知的 URL 格式，保留
    logger.warn({ docId: doc.id, url: url.substring(0, 50) }, "Unknown URL format");
    return url;
  };

  // 并行处理文档内所有图片
  const results = await Promise.all(imageUrls.map(processImage));
  
  results.forEach((newUrl, idx) => {
    newUrls.push(newUrl);
    if (newUrl !== imageUrls[idx]) {
      hasChanges = true;
    }
  });

  return { docId: doc.id, newUrls, hasChanges };
}

/**
 * 执行图片迁移（批量并发版）
 *
 * 在应用启动时调用，自动将 base64 和 R2 图片迁移到本地存储
 * 默认并发数：5个文档同时处理
 */
export async function migrateImagesToLocal(options?: { concurrency?: number }): Promise<MigrationStats> {
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
  // 降低默认并发，避免 SQLite 和网络阻塞
  const concurrency = options?.concurrency ?? 2;
  logger.info({ concurrency }, "Starting image migration to local storage (batch mode)...");

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

    logger.info({ totalDocuments: docs.length, concurrency }, "Found documents to check");

    let processedCount = 0;
    const documentsToUpdate: { docId: string; newUrls: string[] }[] = [];

    // 批量并发处理文档
    await batchProcess(
      docs,
      async (doc) => {
        const result = await processDocument(doc, storage, stats);
        if (result?.hasChanges) {
          documentsToUpdate.push({ docId: result.docId, newUrls: result.newUrls });
        }
        if (result) processedCount++;
      },
      concurrency
    );

    // 批量更新数据库
    if (documentsToUpdate.length > 0) {
      logger.info({ count: documentsToUpdate.length }, "Updating database records...");
      
      for (const { docId, newUrls } of documentsToUpdate) {
        try {
          await db
            .update(sourceDocuments)
            .set({ imageUrls: newUrls })
            .where(eq(sourceDocuments.id, docId));
        } catch (error) {
          logger.error({ error, docId }, "Failed to update document");
        }
      }
    }

    logger.info({
      ...stats,
      processedDocuments: processedCount,
      updatedDocuments: documentsToUpdate.length,
    }, "Image migration completed");

  } catch (error) {
    logger.error({ error }, "Image migration failed");
  } finally {
    migrationRunning = false;
  }

  return stats;
}

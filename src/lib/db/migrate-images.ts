/**
 * 启动时图片迁移 - 将 base64/R2 图片迁移到本地存储
 *
 * 在应用启动时自动执行，检查并迁移现有图片
 */

import { db } from "@/lib/db";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { getLocalStorage } from "@/lib/storage/local";
import { base64ToBuffer, isBase64Url, isHttpUrl } from "@/lib/storage/index";
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
  const startTime = Date.now();
  try {
    console.log(`    [DOWNLOAD] 开始下载: ${url.substring(0, 60)}...`);

    const response = await fetch(url, {
      headers: { "User-Agent": "Cashier-Migration/1.0" },
    });

    if (!response.ok) {
      console.log(`    [DOWNLOAD] ❌ 失败: HTTP ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const duration = Date.now() - startTime;

    console.log(`    [DOWNLOAD] ✅ 完成: ${buffer.length} bytes, ${contentType}, ${duration}ms`);
    return { buffer, mimeType: contentType };
  } catch (error) {
    console.log(`    [DOWNLOAD] ❌ 错误: ${error instanceof Error ? error.message : String(error)}`);
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
 * 执行图片迁移（单文档顺序处理，带详细日志）
 */
export async function migrateImagesToLocal(): Promise<MigrationStats> {
  if (migrationRunning) {
    console.log("[MIGRATION] 迁移已在进行中，跳过");
    return {
      totalImages: 0,
      migratedFromBase64: 0,
      migratedFromR2: 0,
      alreadyLocal: 0,
      failedImages: 0,
    };
  }

  migrationRunning = true;
  const startTime = Date.now();

  console.log("\n" + "=".repeat(60));
  console.log("  图片迁移开始");
  console.log("=".repeat(60));

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
    console.log("\n[STEP 1/3] 查询数据库中的文档...");
    const docs = await db.query.sourceDocuments.findMany({
      where: isNull(sourceDocuments.deletedAt),
    });

    console.log(`[STEP 1/3] ✓ 找到 ${docs.length} 个文档`);

    // 先统计需要处理的文档
    let docsNeedMigration = 0;
    let totalImagesNeedMigration = 0;

    for (const doc of docs) {
      const imageUrls = doc.imageUrls as string[];
      if (imageUrls && imageUrls.length > 0) {
        const needsMigration = imageUrls.some(url => !url.startsWith('/api/uploads/'));
        if (needsMigration) {
          docsNeedMigration++;
          totalImagesNeedMigration += imageUrls.length;
        }
      }
    }

    console.log(`\n[统计] 需要迁移的文档: ${docsNeedMigration}/${docs.length}`);
    console.log(`[统计] 需要处理的图片: ${totalImagesNeedMigration} 张`);
    console.log(`\n[STEP 2/3] 开始处理文档...`);

    let processedDocs = 0;
    let updatedDocs = 0;

    // 单文档顺序处理
    for (const doc of docs) {
      processedDocs++;
      const imageUrls = doc.imageUrls as string[];

      if (!imageUrls || imageUrls.length === 0) {
        continue;
      }

      // 检查是否需要迁移
      const needsMigration = imageUrls.some(url => !url.startsWith('/api/uploads/'));
      if (!needsMigration) {
        console.log(`\n[${processedDocs}/${docs.length}] 文档 ${doc.id.substring(0, 8)}... - 已是最新，跳过`);
        stats.alreadyLocal += imageUrls.length;
        continue;
      }

      console.log(`\n[${processedDocs}/${docs.length}] 文档 ${doc.id.substring(0, 8)}... - ${imageUrls.length} 张图片`);

      const newUrls: string[] = [];
      let hasChanges = false;

      // 处理每张图片
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        stats.totalImages++;

        console.log(`  [${i + 1}/${imageUrls.length}] 处理图片...`);

        // 1. 已经是本地 URL
        if (url.startsWith('/api/uploads/')) {
          console.log(`  [${i + 1}/${imageUrls.length}] ✅ 已是本地存储`);
          newUrls.push(url);
          stats.alreadyLocal++;
          continue;
        }

        // 2. Base64 图片
        if (isBase64Url(url)) {
          console.log(`  [${i + 1}/${imageUrls.length}] 📦 发现 Base64 图片，开始解码...`);
          const imgStartTime = Date.now();

          try {
            const { buffer, mimeType } = base64ToBuffer(url);
            const decodedSize = buffer.length;
            console.log(`  [${i + 1}/${imageUrls.length}]    解码完成: ${decodedSize} bytes`);

            const ext = mimeType.split('/')[1] || 'jpg';
            const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;
            console.log(`  [${i + 1}/${imageUrls.length}]    上传路径: ${key}`);

            const uploadStart = Date.now();
            const newUrl = await storage.upload(key, buffer, mimeType);
            console.log(`  [${i + 1}/${imageUrls.length}]    上传完成: ${Date.now() - uploadStart}ms`);

            newUrls.push(newUrl);
            stats.migratedFromBase64++;
            hasChanges = true;

            const totalTime = Date.now() - imgStartTime;
            console.log(`  [${i + 1}/${imageUrls.length}] ✅ Base64 迁移成功 (${totalTime}ms)`);
          } catch (error) {
            console.log(`  [${i + 1}/${imageUrls.length}] ❌ Base64 迁移失败: ${error instanceof Error ? error.message : String(error)}`);
            newUrls.push(url);
            stats.failedImages++;
          }
          continue;
        }

        // 3. R2/HTTP 图片
        if (isHttpUrl(url)) {
          console.log(`  [${i + 1}/${imageUrls.length}] 🌐 发现 R2 图片，开始下载...`);

          const downloaded = await downloadFromR2(url);
          if (!downloaded) {
            console.log(`  [${i + 1}/${imageUrls.length}] ❌ 下载失败，保留原 URL`);
            newUrls.push(url);
            stats.failedImages++;
            continue;
          }

          console.log(`  [${i + 1}/${imageUrls.length}]    开始上传...`);
          const uploadStart = Date.now();

          try {
            const mimeType = downloaded.mimeType;
            const ext = mimeType.split('/')[1] || inferMimeType(url);
            const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

            const newUrl = await storage.upload(key, downloaded.buffer, mimeType);
            console.log(`  [${i + 1}/${imageUrls.length}]    上传完成: ${Date.now() - uploadStart}ms`);

            newUrls.push(newUrl);
            stats.migratedFromR2++;
            hasChanges = true;

            console.log(`  [${i + 1}/${imageUrls.length}] ✅ R2 迁移成功`);
          } catch (error) {
            console.log(`  [${i + 1}/${imageUrls.length}] ❌ 上传失败: ${error instanceof Error ? error.message : String(error)}`);
            newUrls.push(url);
            stats.failedImages++;
          }
          continue;
        }

        // 未知格式
        console.log(`  [${i + 1}/${imageUrls.length}] ⚠️ 未知格式: ${url.substring(0, 50)}`);
        newUrls.push(url);
      }

      // 更新数据库
      if (hasChanges) {
        console.log(`  [DB] 更新文档记录...`);
        const dbStart = Date.now();
        try {
          await db
            .update(sourceDocuments)
            .set({ imageUrls: newUrls })
            .where(eq(sourceDocuments.id, doc.id));
          updatedDocs++;
          console.log(`  [DB] ✅ 更新完成 (${Date.now() - dbStart}ms)`);
        } catch (error) {
          console.log(`  [DB] ❌ 更新失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // 最终统计
    const totalTime = Date.now() - startTime;
    console.log("\n" + "=".repeat(60));
    console.log("  迁移完成");
    console.log("=".repeat(60));
    console.log(`\n总耗时: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`处理文档: ${processedDocs}/${docs.length}`);
    console.log(`更新文档: ${updatedDocs}`);
    console.log(`\n图片统计:`);
    console.log(`  总计检查: ${stats.totalImages} 张`);
    console.log(`  Base64 迁移: ${stats.migratedFromBase64} 张`);
    console.log(`  R2 迁移: ${stats.migratedFromR2} 张`);
    console.log(`  已是本地: ${stats.alreadyLocal} 张`);
    console.log(`  失败: ${stats.failedImages} 张`);
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("\n[MIGRATION] ❌ 迁移失败:", error);
  } finally {
    migrationRunning = false;
  }

  return stats;
}

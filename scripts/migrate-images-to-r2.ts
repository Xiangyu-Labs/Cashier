/**
 * Migration script: Move base64 images from database to R2
 *
 * Usage:
 *   npx tsx scripts/migrate-images-to-r2.ts          # Run migration
 *   npx tsx scripts/migrate-images-to-r2.ts --dry-run # Preview only
 *   npx tsx scripts/migrate-images-to-r2.ts --batch-size=10 # Custom batch size
 */

import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { getR2Storage, isR2Enabled } from "@/lib/storage/r2";
import { isBase64Url } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Load env first
config({ path: resolve(projectRoot, ".env.local") });

// Convert relative database path to absolute path
const dbUrl = process.env.DATABASE_URL || "file:./data/sqlite.db";
if (dbUrl.startsWith("file:./") || dbUrl.startsWith("file:")) {
    const dbPath = dbUrl.replace(/^file:/, "");
    process.env.DATABASE_URL = resolve(projectRoot, dbPath);
}

interface MigrationStats {
    totalDocuments: number;
    processedDocuments: number;
    skippedDocuments: number;
    failedDocuments: number;
    totalImages: number;
    uploadedImages: number;
    failedImages: number;
}

interface MigrationResult {
    documentId: string;
    ledgerId: string;
    oldUrls: string[];
    newUrls: string[];
    success: boolean;
    error?: string;
}

function parseArgs() {
    const args = process.argv.slice(2);
    return {
        dryRun: args.includes("--dry-run"),
        batchSize: parseInt(
            args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "50",
            10
        ),
    };
}

function extractMimeTypeFromBase64(base64Url: string): string {
    const match = base64Url.match(/^data:([^;]+);base64,/);
    return match?.[1] || "image/jpeg";
}

function base64ToBuffer(base64Url: string): Buffer {
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64Data, "base64");
}

async function main() {
    const { dryRun, batchSize } = parseArgs();

    logger.info(
        { dryRun, batchSize },
        "Starting R2 migration"
    );

    // Check R2 is enabled
    if (!isR2Enabled()) {
        logger.error(
            "R2 is not enabled. Set ENABLE_R2_STORAGE=true and configure R2 credentials."
        );
        process.exit(1);
    }

    // Verify R2 connection
    try {
        const storage = getR2Storage();
        logger.info(
            "R2 storage initialized"
        );
    } catch (error) {
        logger.error({ error }, "Failed to initialize R2 storage");
        process.exit(1);
    }

    // Dynamic import db AFTER env setup (must be dynamic to ensure env is loaded)
    const { db } = await import("../src/lib/db/index.js");
    const { sourceDocuments, taskRuns } = await import("../src/lib/db/schema.js");

    // Get documents with base64 images
    const docs = await db.query.sourceDocuments.findMany({
        columns: {
            id: true,
            ledgerId: true,
            imageUrls: true,
        },
    });

    const documents = docs.filter(
        (doc) => doc.imageUrls?.some((url) => isBase64Url(url))
    ) as Array<{
        id: string;
        ledgerId: string;
        imageUrls: string[];
    }>;

    logger.info(
        { count: documents.length },
        "Found documents with base64 images"
    );

    if (documents.length === 0) {
        logger.info("No documents to migrate");
        process.exit(0);
    }

    if (dryRun) {
        logger.info("DRY RUN MODE - No changes will be made");
    }

    // Calculate stats
    const totalImages = documents.reduce(
        (sum, doc) => sum + doc.imageUrls.length,
        0
    );
    const base64Images = documents.reduce(
        (sum, doc) => sum + doc.imageUrls.filter((u) => isBase64Url(u)).length,
        0
    );

    logger.info(
        {
            documents: documents.length,
            totalImages,
            base64Images,
        },
        "Migration stats"
    );

    // Process in batches
    const stats: MigrationStats = {
        totalDocuments: documents.length,
        processedDocuments: 0,
        skippedDocuments: 0,
        failedDocuments: 0,
        totalImages: base64Images,
        uploadedImages: 0,
        failedImages: 0,
    };

    const storage = getR2Storage();

    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        logger.info(
            { batch: Math.floor(i / batchSize) + 1, size: batch.length },
            "Processing batch"
        );

        for (const doc of batch) {
            const result: MigrationResult = {
                documentId: doc.id,
                ledgerId: doc.ledgerId,
                oldUrls: doc.imageUrls,
                newUrls: [],
                success: false,
            };

            const urlMapping: Map<string, string> = new Map();

            try {
                for (const url of doc.imageUrls) {
                    if (!isBase64Url(url)) {
                        // Already an HTTP URL, keep as is
                        result.newUrls.push(url);
                        continue;
                    }

                    if (dryRun) {
                        // Simulate upload in dry run mode
                        result.newUrls.push(
                            `dry-run://${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.jpg`
                        );
                        continue;
                    }

                    // Upload to R2
                    const mimeType = extractMimeTypeFromBase64(url);
                    const buffer = base64ToBuffer(url);
                    const ext = mimeType.split("/")[1] || "jpg";
                    const key = `${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.${ext}`;

                    const uploadedUrl = await storage.upload(key, buffer, mimeType);
                    result.newUrls.push(uploadedUrl);
                    urlMapping.set(url, uploadedUrl);

                    logger.debug(
                        { documentId: doc.id, key, size: buffer.length },
                        "Uploaded image to R2"
                    );
                }

                if (!dryRun) {
                    // Update source document
                    await db
                        .update(sourceDocuments)
                        .set({ imageUrls: result.newUrls })
                        .where(eq(sourceDocuments.id, doc.id));

                    // Update related task_runs that might have the old URLs in input
                    const relatedTaskRuns = await db.query.taskRuns.findMany({
                        where: eq(taskRuns.entityId, doc.id),
                    });

                    for (const task of relatedTaskRuns) {
                        if (task.input && typeof task.input === "object") {
                            const input = task.input as {
                                imageUrls?: string[];
                            };
                            if (input.imageUrls && input.imageUrls.length > 0) {
                                const updatedImageUrls = input.imageUrls.map((url) => {
                                    for (const [
                                        oldUrl,
                                        newUrl,
                                    ] of urlMapping.entries()) {
                                        if (url === oldUrl) {
                                            return newUrl;
                                        }
                                    }
                                    return url;
                                });

                                // Only update if there were changes
                                if (
                                    JSON.stringify(updatedImageUrls) !==
                                    JSON.stringify(input.imageUrls)
                                ) {
                                    await db
                                        .update(taskRuns)
                                        .set({
                                            input: {
                                                ...(task.input as object),
                                                imageUrls: updatedImageUrls,
                                            },
                                        })
                                        .where(eq(taskRuns.id, task.id));

                                    logger.debug(
                                        { taskId: task.id, documentId: doc.id },
                                        "Updated task_runs input"
                                    );
                                }
                            }
                        }
                    }
                }

                result.success = true;
            } catch (error) {
                result.error =
                    error instanceof Error ? error.message : "Unknown error";
                logger.error(
                    { error, documentId: doc.id },
                    "Failed to migrate document"
                );
            }

            if (result.success) {
                stats.processedDocuments++;
                stats.uploadedImages += doc.imageUrls.filter((u) =>
                    isBase64Url(u)
                ).length;
            } else {
                stats.failedDocuments++;
                logger.error(
                    { documentId: doc.id, error: result.error },
                    "Document migration failed"
                );
            }
        }

        // Progress report
        logger.info(
            {
                progress: `${Math.min(i + batchSize, documents.length)}/${documents.length}`,
                processed: stats.processedDocuments,
                failed: stats.failedDocuments,
            },
            "Progress update"
        );
    }

    // Final stats
    logger.info(
        {
            ...stats,
            successRate: `${(
                (stats.processedDocuments / stats.totalDocuments) *
                100
            ).toFixed(1)}%`,
        },
        "Migration complete"
    );

    if (stats.failedDocuments > 0) {
        logger.warn(
            `${stats.failedDocuments} documents failed to migrate. You can re-run this script to retry failed documents.`
        );
        process.exit(1);
    }

    // Run VACUUM to reclaim disk space
    if (!dryRun && stats.processedDocuments > 0) {
        const fs = await import("fs");
        const dbPath = process.env.DATABASE_URL!;
        const sizeBefore = fs.statSync(dbPath).size;

        logger.info(
            { sizeBefore: `${(sizeBefore / 1024 / 1024).toFixed(1)}MB` },
            "Running VACUUM to reclaim disk space..."
        );

        // Get raw SQLite connection and run VACUUM
        const Database = (await import("better-sqlite3")).default;
        const sqlite = new Database(dbPath);
        sqlite.exec("VACUUM");
        sqlite.close();

        const sizeAfter = fs.statSync(dbPath).size;
        const savedMB = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(1);

        logger.info(
            {
                sizeBefore: `${(sizeBefore / 1024 / 1024).toFixed(1)}MB`,
                sizeAfter: `${(sizeAfter / 1024 / 1024).toFixed(1)}MB`,
                saved: `${savedMB}MB`,
            },
            "VACUUM complete - disk space reclaimed"
        );
    }

    process.exit(0);
}

main().catch((error) => {
    logger.error(
        {
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                code: (error as { code?: string }).code
            } : error
        },
        "Migration failed"
    );
    process.exit(1);
});

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
import { isBase64Url, base64ToBuffer } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as dbSchema from "@/lib/db/schema";

type DbSchema = typeof dbSchema;

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

// Lazily loaded modules to ensure env is set up first
let db: BetterSQLite3Database<DbSchema>;
let schema: typeof import("@/lib/db/schema");

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

interface ParsedArgs {
    dryRun: boolean;
    batchSize: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    return {
        dryRun: args.includes("--dry-run"),
        batchSize: parseInt(
            args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "50",
            10
        ),
    };
}

/**
 * Validate environment configuration
 * @throws Error if R2 is not properly configured
 */
function validateEnvironment(): void {
    if (!isR2Enabled()) {
        throw new Error(
            "R2 is not enabled. Set ENABLE_R2_STORAGE=true and configure R2 credentials."
        );
    }
}

/**
 * Initialize R2 storage and verify connection
 * @throws Error if R2 connection fails
 */
function initializeR2Storage(): ReturnType<typeof getR2Storage> {
    const storage = getR2Storage();
    logger.info("R2 storage initialized");
    return storage;
}

/**
 * Load database modules dynamically (after env setup)
 */
async function initializeDatabase(): Promise<void> {
    const dbModule = await import("../src/lib/db/index.js");
    db = dbModule.db as BetterSQLite3Database<DbSchema>;
    schema = await import("../src/lib/db/schema.js");
}

/**
 * Extract MIME type from base64 data URL
 */
function extractMimeTypeFromBase64(base64Url: string): string {
    const match = base64Url.match(/^data:([^;]+);base64,/);
    return match?.[1] || "image/jpeg";
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/heic": "heic",
        "image/heif": "heif",
    };
    return mimeToExt[mimeType] || "jpg";
}

/**
 * Upload a single image to R2
 */
async function uploadImageToR2(
    storage: ReturnType<typeof getR2Storage>,
    base64Url: string,
    ledgerId: string,
    documentId: string
): Promise<{ url: string; size: number }> {
    const mimeType = extractMimeTypeFromBase64(base64Url);
    const { buffer } = base64ToBuffer(base64Url);
    const ext = getExtensionFromMimeType(mimeType);
    const key = `${ledgerId}/${documentId}/${crypto.randomUUID()}.${ext}`;

    const uploadedUrl = await storage.upload(key, buffer, mimeType);

    logger.debug({ documentId, key, size: buffer.length }, "Uploaded image to R2");

    return { url: uploadedUrl, size: buffer.length };
}

/**
 * Process a batch of documents
 */
async function processBatch(
    storage: ReturnType<typeof getR2Storage>,
    batch: Array<{ id: string; ledgerId: string; imageUrls: string[] }>,
    dryRun: boolean,
    stats: MigrationStats
): Promise<void> {
    const { sourceDocuments, taskRuns } = dbSchema;

    for (const doc of batch) {
        const result: MigrationResult = {
            documentId: doc.id,
            ledgerId: doc.ledgerId,
            oldUrls: doc.imageUrls,
            newUrls: [],
            success: false,
        };

        // Use Map for O(1) URL lookups
        const urlMapping = new Map<string, string>();

        try {
            // Process images in parallel for better throughput
            const imagePromises = doc.imageUrls.map(async (url) => {
                if (!isBase64Url(url)) {
                    // Already an HTTP URL, keep as is
                    return { oldUrl: url, newUrl: url, isBase64: false };
                }

                if (dryRun) {
                    return {
                        oldUrl: url,
                        newUrl: `dry-run://${doc.ledgerId}/${doc.id}/${crypto.randomUUID()}.jpg`,
                        isBase64: true,
                    };
                }

                const { url: uploadedUrl } = await uploadImageToR2(storage, url, doc.ledgerId, doc.id);
                return { oldUrl: url, newUrl: uploadedUrl, isBase64: true };
            });

            const imageResults = await Promise.all(imagePromises);

            for (const imgResult of imageResults) {
                result.newUrls.push(imgResult.newUrl);
                if (imgResult.isBase64) {
                    urlMapping.set(imgResult.oldUrl, imgResult.newUrl);
                }
            }

            if (!dryRun) {
                await updateDocumentAndTasks(db, sourceDocuments, taskRuns, doc.id, result.newUrls, urlMapping);
            }

            result.success = true;
        } catch (error) {
            result.error = error instanceof Error ? error.message : "Unknown error";
            logger.error({ error, documentId: doc.id }, "Failed to migrate document");
        }

        updateStats(stats, result, doc);
    }
}

/**
 * Update source document and related task runs with new URLs
 */
async function updateDocumentAndTasks(
    db: BetterSQLite3Database<DbSchema>,
    sourceDocuments: typeof schema.sourceDocuments,
    taskRuns: typeof schema.taskRuns,
    documentId: string,
    newUrls: string[],
    urlMapping: Map<string, string>
): Promise<void> {
    // Update source document
    await db
        .update(sourceDocuments)
        .set({ imageUrls: newUrls })
        .where(eq(sourceDocuments.id, documentId));

    // Update related task_runs that might have the old URLs in input
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: eq(taskRuns.entityId, documentId),
    });

    for (const task of relatedTaskRuns) {
        if (task.input && typeof task.input === "object") {
            const input = task.input as { imageUrls?: string[] };
            if (input.imageUrls && input.imageUrls.length > 0) {
                const updatedImageUrls = input.imageUrls.map((url) => {
                    // O(1) lookup using Map
                    return urlMapping.get(url) ?? url;
                });

                // Only update if there were changes
                if (JSON.stringify(updatedImageUrls) !== JSON.stringify(input.imageUrls)) {
                    await db.update(taskRuns).set({
                        input: {
                            ...(task.input as object),
                            imageUrls: updatedImageUrls,
                        },
                    }).where(eq(taskRuns.id, task.id));

                    logger.debug({ taskId: task.id, documentId }, "Updated task_runs input");
                }
            }
        }
    }
}

/**
 * Update migration statistics based on result
 */
function updateStats(
    stats: MigrationStats,
    result: MigrationResult,
    doc: { id: string; imageUrls: string[] }
): void {
    if (result.success) {
        stats.processedDocuments++;
        stats.uploadedImages += doc.imageUrls.filter((u) => isBase64Url(u)).length;
    } else {
        stats.failedDocuments++;
        logger.error({ documentId: doc.id, error: result.error }, "Document migration failed");
    }
}

/**
 * Fetch documents with base64 images using cursor pagination
 */
async function fetchDocumentsWithBase64Images(
    batchSize: number
): Promise<Array<{ id: string; ledgerId: string; imageUrls: string[] }>> {
    const { sourceDocuments } = schema;

    // Get all documents with imageUrls
    // Note: For large datasets, consider using offset/limit pagination
    const docs = await db.query.sourceDocuments.findMany({
        columns: {
            id: true,
            ledgerId: true,
            imageUrls: true,
        },
    });

    // Filter documents with base64 images
    return docs.filter(
        (doc): doc is typeof doc & { imageUrls: string[] } =>
            doc.imageUrls?.some((url) => isBase64Url(url)) ?? false
    ) as Array<{ id: string; ledgerId: string; imageUrls: string[] }>;
}

/**
 * Print migration statistics
 */
function printMigrationStats(stats: MigrationStats): void {
    logger.info(
        {
            ...stats,
            successRate: stats.totalDocuments > 0
                ? `${((stats.processedDocuments / stats.totalDocuments) * 100).toFixed(1)}%`
                : "N/A",
        },
        "Migration complete"
    );

    if (stats.failedDocuments > 0) {
        logger.warn(
            `${stats.failedDocuments} documents failed to migrate. You can re-run this script to retry failed documents.`
        );
    }
}

/**
 * Run VACUUM to reclaim disk space after migration
 */
async function runVacuumIfNeeded(dryRun: boolean, processedCount: number): Promise<void> {
    if (dryRun || processedCount === 0) {
        return;
    }

    const fs = await import("fs");
    const dbPath = process.env.DATABASE_URL!;

    let sizeBefore: number;
    try {
        sizeBefore = fs.statSync(dbPath).size;
    } catch (error) {
        logger.error({ error }, "Failed to get database file size before VACUUM");
        return;
    }

    logger.info(
        { sizeBefore: `${(sizeBefore / 1024 / 1024).toFixed(1)}MB` },
        "Running VACUUM to reclaim disk space..."
    );

    try {
        // Get raw SQLite connection and run VACUUM
        const Database = (await import("better-sqlite3")).default;
        const sqlite = new Database(dbPath);
        sqlite.exec("VACUUM");
        sqlite.close();

        let sizeAfter: number;
        try {
            sizeAfter = fs.statSync(dbPath).size;
        } catch {
            sizeAfter = 0;
        }
        const savedMB = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(1);

        logger.info(
            {
                sizeBefore: `${(sizeBefore / 1024 / 1024).toFixed(1)}MB`,
                sizeAfter: `${(sizeAfter / 1024 / 1024).toFixed(1)}MB`,
                saved: `${savedMB}MB`,
            },
            "VACUUM complete - disk space reclaimed"
        );
    } catch (error) {
        logger.error({ error }, "VACUUM operation failed");
        // Don't throw - VACUUM failure shouldn't fail the migration
    }
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
    const { dryRun, batchSize } = parseArgs();

    logger.info({ dryRun, batchSize }, "Starting R2 migration");

    // Step 1: Validate environment
    validateEnvironment();

    // Step 2: Initialize R2 storage
    const storage = initializeR2Storage();

    // Step 3: Initialize database
    await initializeDatabase();

    // Step 4: Fetch documents to migrate
    const documents = await fetchDocumentsWithBase64Images(batchSize);

    logger.info({ count: documents.length }, "Found documents with base64 images");

    if (documents.length === 0) {
        logger.info("No documents to migrate");
        process.exit(0);
    }

    if (dryRun) {
        logger.info("DRY RUN MODE - No changes will be made");
    }

    // Calculate stats
    const base64Images = documents.reduce(
        (sum, doc) => sum + doc.imageUrls.filter((u) => isBase64Url(u)).length,
        0
    );

    logger.info(
        {
            documents: documents.length,
            totalImages: documents.reduce((sum, doc) => sum + doc.imageUrls.length, 0),
            base64Images,
        },
        "Migration stats"
    );

    // Step 5: Process documents in batches
    const stats: MigrationStats = {
        totalDocuments: documents.length,
        processedDocuments: 0,
        skippedDocuments: 0,
        failedDocuments: 0,
        totalImages: base64Images,
        uploadedImages: 0,
        failedImages: 0,
    };

    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        logger.info(
            { batch: Math.floor(i / batchSize) + 1, size: batch.length },
            "Processing batch"
        );

        await processBatch(storage, batch, dryRun, stats);

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

    // Step 6: Print final stats
    printMigrationStats(stats);

    // Step 7: Run VACUUM to reclaim disk space
    await runVacuumIfNeeded(dryRun, stats.processedDocuments);

    // Exit with error code if any documents failed
    if (stats.failedDocuments > 0) {
        process.exit(1);
    }

    process.exit(0);
}

main().catch((error) => {
    logger.error(
        {
            error: error instanceof Error
                ? {
                      message: error.message,
                      stack: error.stack,
                      code: (error as { code?: string }).code,
                  }
                : error,
        },
        "Migration failed"
    );
    process.exit(1);
});

import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        r2Enabled: process.env.ENABLE_R2_STORAGE === "true",
        r2Endpoint: process.env.R2_ENDPOINT ? "configured" : "not configured",
        r2Bucket: process.env.R2_BUCKET_NAME ? "configured" : "not configured",
    }, "Service configuration status");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Dynamic import to avoid Edge Runtime static analysis issues
            const { autoRegisterTasks } = await import("@/lib/flow/task-registry");
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
            logger.info("Task handlers auto-registered successfully");

            // Migrate images to local storage (idempotent, runs once)
            const { migrateImagesToLocal } = await import("@/lib/db/migrate-images");
            const stats = await migrateImagesToLocal();
            if (stats.totalImages > 0) {
                logger.info({
                    total: stats.totalImages,
                    base64: stats.migratedFromBase64,
                    r2: stats.migratedFromR2,
                    local: stats.alreadyLocal,
                    failed: stats.failedImages,
                }, "Image migration completed");
            }
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

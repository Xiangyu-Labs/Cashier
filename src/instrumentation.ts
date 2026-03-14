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
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
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

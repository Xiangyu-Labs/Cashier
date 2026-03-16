import { logger } from "@/lib/logger";

export async function register() {
    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    }, "Service configuration status");

    try {
        // Explicitly import task handlers to register them
        // Each module registers itself via side effect (flowEngine.register())
        await import("@/features/source-document/server/tasks/parse-source-document");
        await import("@/features/ledger/server/tasks/generate-category-metadata");
        await import("@/features/ledger/server/tasks/categorize-entry");

        logger.info("Task handlers registered successfully");
    } catch (error) {
        logger.error({ error }, "Failed during startup initialization");
    }
}

import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Register task handlers (needed for in-process runner)
            await import("@/features/source-document/server/tasks/parse-source-document");
            await import("@/features/ledger/server/tasks/generate-category-metadata");
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

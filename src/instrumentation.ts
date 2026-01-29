import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Register task handlers and start workers
            await import("@/lib/tasks");
            await import("@/lib/flow/workers");
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

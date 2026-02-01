import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Register task handlers (always needed for producer to work)
            await import("@/lib/tasks");

            // Only initialize workers if enabled via environment variable
            // This prevents double initialization during build/dev and allows separation of concerns
            // Default to true in development if not explicitly set
            const shouldStartWorkers = process.env.ENABLE_WORKERS === 'true' ||
                (process.env.NODE_ENV === 'development' && process.env.ENABLE_WORKERS !== 'false');

            if (shouldStartWorkers) {
                logger.info("Initializing background workers...");
                const { initializeWorkers } = await import("@/lib/flow/workers");
                await initializeWorkers();
            } else {
                logger.info("Skipping worker initialization (ENABLE_WORKERS!=true)");
            }
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

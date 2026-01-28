import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Register task handlers (side-effect imports)
            await import("@/lib/tasks");

            // Handle processing task recovery (mark running as failed)
            const { handleTasksOnStartup } = await import("@/lib/processing/recovery");
            await handleTasksOnStartup();
        } catch (error) {
            logger.error({ error }, "Failed during startup recovery");
        }
    }
}

import { logger } from "@/lib/logger";
import { autoRegisterTasks } from "@/lib/flow/task-registry";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

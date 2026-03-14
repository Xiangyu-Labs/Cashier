import { logger } from "@/lib/logger";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Dynamic import to avoid Edge Runtime static analysis issues
            const { autoRegisterTasks } = await import("@/lib/flow/task-registry");
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}

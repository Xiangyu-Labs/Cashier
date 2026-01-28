// GPT Task Recovery
// Handles task state after service restarts
// Best-effort: simply marks running tasks as failed

import { db } from "@/lib/db";
import { gptTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processTaskQueue } from "./task-worker";
import { logger } from "@/lib/logger";

/**
 * Handle tasks that were running when the service stopped.
 * Best-effort approach: mark all running tasks as failed.
 * Business layer is responsible for deciding how to handle failures.
 * 
 * Called during application startup (instrumentation).
 */
export async function handleTasksOnStartup(): Promise<void> {
    try {
        // Mark all running tasks as failed
        const result = await db.update(gptTasks)
            .set({
                status: "failed",
                error: "Task interrupted by service restart",
                completedAt: new Date(),
            })
            .where(eq(gptTasks.status, "running"))
            .returning({ id: gptTasks.id });

        if (result.length > 0) {
            logger.info({ count: result.length }, "[Task Recovery] Marked interrupted tasks as failed");
        }

        // Start processing any queued tasks
        processTaskQueue().catch((err) => {
            logger.error({ err }, "[Task Recovery] Failed to start queue processing");
        });

    } catch (error) {
        logger.error({ error }, "[Task Recovery] Failed to handle tasks on startup");
    }
}

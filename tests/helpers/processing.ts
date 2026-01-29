import { db } from "@/lib/db";
import { taskRuns, sourceDocuments } from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";

/**
 * Polls for all pending task runs to complete.
 * In a real BullMQ environment, the workers are running separately.
 * In integration tests, we wait for the database to reflect completion.
 */
export async function processAllPendingTasks(timeoutMs: number = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        // Check for any task_runs that are still 'running'
        const pendingRuns = await db.query.taskRuns.findMany({
            where: eq(taskRuns.status, 'running')
        });

        // Also check source_documents if they are in transient states
        const pendingDocs = await db.query.sourceDocuments.findMany({
            where: or(
                eq(sourceDocuments.status, 'queued'),
                eq(sourceDocuments.status, 'processing')
            )
        });

        if (pendingRuns.length === 0 && pendingDocs.length === 0) {
            return;
        }

        await new Promise(r => setTimeout(r, 200));
    }

    console.warn(`processAllPendingTasks timed out after ${timeoutMs}ms`);
}

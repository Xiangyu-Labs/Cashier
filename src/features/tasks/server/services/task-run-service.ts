/**
 * Task run service - simplified for new Flow Engine architecture
 *
 * Most database operations are now handled by the Flow Engine's storage adapter.
 * This service provides additional utilities for querying and managing task runs.
 */

import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Get a task run by ID (with optional ledger scoping for security)
 */
export async function getTaskRun(taskRunId: string, ledgerId?: string) {
    if (ledgerId) {
        const q = forLedger(taskRuns, ledgerId);
        return db.query.taskRuns.findFirst({
            where: q.whereId(taskRunId),
        });
    }

    return db.query.taskRuns.findFirst({
        where: eq(taskRuns.id, taskRunId),
    });
}

/**
 * Soft delete a task run
 */
export async function deleteTaskRun(taskRunId: string, ledgerId: string): Promise<void> {
    const q = forLedger(taskRuns, ledgerId);

    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(q.whereId(taskRunId));
}

/**
 * Get task runs for a ledger with pagination
 */
export async function getTaskRunsForLedger(
    ledgerId: string,
    options?: { limit?: number; offset?: number }
) {
    const q = forLedger(taskRuns, ledgerId);

    return db.query.taskRuns.findMany({
        where: q.whereActive,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
    });
}

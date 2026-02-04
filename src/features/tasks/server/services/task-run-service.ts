import { FlowProgress } from "@/lib/flow/types";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Update task run progress in database
 */
export async function updateTaskRunProgress(_taskRunId: string, _progress: FlowProgress): Promise<void> {
    // Progress update logic remains placeholder/optional as discussed
}

export async function completeTaskRun(taskRunId: string, output: unknown, ledgerId?: string): Promise<void> {
    if (!ledgerId) throw new Error("ledgerId is required to complete task run");
    const q = forLedger(taskRuns, ledgerId);

    await db.update(taskRuns)
        .set({
            status: 'completed',
            output: output as unknown,
            completedAt: new Date()
        })
        .where(q.whereId(taskRunId));
}

export async function failTaskRun(taskRunId: string, error: string, ledgerId?: string): Promise<void> {
    if (!ledgerId) throw new Error("ledgerId is required to fail task run");
    const q = forLedger(taskRuns, ledgerId);

    await db.update(taskRuns)
        .set({
            status: 'failed',
            error,
            completedAt: new Date()
        })
        .where(q.whereId(taskRunId));
}

export async function recordTaskRunUsage(taskRunId: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }, ledgerId?: string): Promise<void> {
    let whereClause;

    if (ledgerId) {
        const q = forLedger(taskRuns, ledgerId);
        whereClause = q.whereId(taskRunId);
    } else {
        // Fallback if no ledgerId provided (though it should be for safety)
        whereClause = eq(taskRuns.id, taskRunId);
    }

    // SQLite compatible: Read current usage, accumulate, then write back
    // Using json() function for SQLite JSON manipulation
    const existingTask = await db.query.taskRuns.findFirst({
        where: whereClause,
        columns: { usage: true }
    });

    const currentUsage = existingTask?.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const newUsage = {
        inputTokens: (currentUsage.inputTokens || 0) + usage.inputTokens,
        outputTokens: (currentUsage.outputTokens || 0) + usage.outputTokens,
        totalTokens: (currentUsage.totalTokens || 0) + usage.totalTokens
    };

    await db.update(taskRuns)
        .set({
            usage: newUsage
        })
        .where(whereClause);
}

export async function incrementTaskRunStats(_taskRunId: string, _type: 'completed' | 'failed'): Promise<void> {
    // Atomic increment would be ideal, leaving placeholder
}


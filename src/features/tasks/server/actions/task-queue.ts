"use server";

import { db } from "@/lib/db";
import { taskRuns, type TaskRun } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";

/**
 * Status groups for the task queue UI
 */
export interface TaskQueueGroups {
    /** Tasks waiting in queue (status = 'pending') */
    pending: SerializedTaskRun[];
    /** Tasks currently running (status = 'running') */
    running: SerializedTaskRun[];
    /** Tasks that failed (status = 'failed') */
    failed: SerializedTaskRun[];
    /** Recently completed tasks (status = 'completed', latest 5) */
    completed: SerializedTaskRun[];
}

export interface TaskQueueStats {
    pendingCount: number;
    runningCount: number;
    failedCount: number;
    completedCount: number;
    total: number;
    // Token stats
    totalInputTokens: number;
    totalOutputTokens: number;
    avgTokensPerTask: number;
}

export interface TaskQueueResult {
    groups: TaskQueueGroups;
    stats: TaskQueueStats;
}

/** Serialized version for client transport */
export interface SerializedTaskRun {
    id: string;
    type: string;
    title: string;
    status: string;
    progress: string | null;
    error: string | null;
    input: unknown | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
}

function serializeTaskRun(task: TaskRun): SerializedTaskRun {
    return {
        id: task.id,
        type: task.type,
        title: task.title,
        status: task.status,
        progress: task.progress,
        error: task.error,
        input: task.input,
        createdAt: task.createdAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
    };
}

/**
 * Helper to extract ledgerId from task input
 */
function getLedgerIdFromInput(input: unknown): string | null {
    if (typeof input === 'object' && input !== null && 'ledgerId' in input) {
        return (input as { ledgerId?: string }).ledgerId ?? null;
    }
    return null;
}

/**
 * Get task queue data for the unified Task Queue Modal.
 * Returns tasks grouped by status with token statistics.
 * 
 * Since ledgerId is now stored in input JSON, we fetch all active tasks
 * and filter in memory by parsing input.ledgerId.
 */
export async function getTaskQueueAction(ledgerId: string): Promise<TaskQueueResult> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    // Fetch all active tasks (not soft-deleted)
    const allActiveTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            inArray(taskRuns.status, ["pending", "running", "failed"])
        ),
        orderBy: [desc(taskRuns.createdAt)],
    });

    // Filter by ledgerId from input
    const activeTasks = allActiveTasks.filter(task =>
        getLedgerIdFromInput(task.input) === ledgerId
    );

    // Fetch all completed tasks (not soft-deleted)
    const allCompletedTasksRaw = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.status, "completed")
        ),
        orderBy: [desc(taskRuns.completedAt)],
    });

    // Filter by ledgerId from input
    const allCompletedTasks = allCompletedTasksRaw.filter(task =>
        getLedgerIdFromInput(task.input) === ledgerId
    );

    // Get latest 5 completed
    const completedTasks = allCompletedTasks.slice(0, 5);

    // Group tasks by status
    const groups: TaskQueueGroups = {
        pending: [],
        running: [],
        failed: [],
        completed: completedTasks.map(serializeTaskRun),
    };

    for (const task of activeTasks) {
        const serialized = serializeTaskRun(task);
        if (task.status === "pending") {
            groups.pending.push(serialized);
        } else if (task.status === "running") {
            groups.running.push(serialized);
        } else if (task.status === "failed") {
            groups.failed.push(serialized);
        }
    }

    // Calculate token stats from all completed tasks
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const task of allCompletedTasks) {
        if (task.tokenUsage) {
            const u = task.tokenUsage as {
                total?: { input?: number; output?: number };
                [model: string]: { input?: number; output?: number } | undefined
            };
            const total = u.total || { input: 0, output: 0 };
            totalInputTokens += total.input || 0;
            totalOutputTokens += total.output || 0;
        }
    }

    const taskCount = allCompletedTasks.length;
    const totalTokens = totalInputTokens + totalOutputTokens;
    const avgTokensPerTask = taskCount > 0 ? Math.round(totalTokens / taskCount) : 0;

    const stats: TaskQueueStats = {
        pendingCount: groups.pending.length,
        runningCount: groups.running.length,
        failedCount: groups.failed.length,
        completedCount: allCompletedTasks.length,
        total: groups.pending.length + groups.running.length + groups.failed.length,
        totalInputTokens,
        totalOutputTokens,
        avgTokensPerTask,
    };

    return { groups, stats };
}

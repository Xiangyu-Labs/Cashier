"use server";

import { db } from "@/lib/db";
import { taskRuns, type TaskRun } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Status groups for the task queue UI
 */
export interface TaskQueueGroups {
    /** Tasks waiting in queue (status = 'queued') */
    queued: SerializedTaskRun[];
    /** Tasks currently running (status = 'running') */
    running: SerializedTaskRun[];
    /** Tasks that failed (status = 'failed') */
    failed: SerializedTaskRun[];
    /** Recently completed tasks (status = 'completed', latest 5) */
    completed: SerializedTaskRun[];
}

export interface TaskQueueStats {
    queuedCount: number;
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
        createdAt: task.createdAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
    };
}

/**
 * Get task queue data for the unified Task Queue Modal.
 * Returns tasks grouped by status with token statistics.
 */
export async function getTaskQueueAction(ledgerId: string): Promise<TaskQueueResult> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const q = forLedger(taskRuns, ledgerId);

    // Fetch active tasks (queued, running, failed)
    const activeTasks = await db.query.taskRuns.findMany({
        where: and(
            q.whereActive,
            inArray(taskRuns.status, ["queued", "running", "failed"])
        ),
        orderBy: [desc(taskRuns.createdAt)],
    });

    // Fetch recently completed tasks (limit 5)
    const completedTasks = await db.query.taskRuns.findMany({
        where: and(
            q.whereActive,
            eq(taskRuns.status, "completed")
        ),
        orderBy: [desc(taskRuns.completedAt)],
        limit: 5,
    });

    // Fetch all completed tasks for token stats
    const allCompletedTasks = await db.query.taskRuns.findMany({
        where: and(
            q.whereActive,
            eq(taskRuns.status, "completed")
        ),
    });

    // Group tasks by status
    const groups: TaskQueueGroups = {
        queued: [],
        running: [],
        failed: [],
        completed: completedTasks.map(serializeTaskRun),
    };

    for (const task of activeTasks) {
        const serialized = serializeTaskRun(task);
        if (task.status === "queued") {
            groups.queued.push(serialized);
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
        queuedCount: groups.queued.length,
        runningCount: groups.running.length,
        failedCount: groups.failed.length,
        completedCount: allCompletedTasks.length,
        total: groups.queued.length + groups.running.length + groups.failed.length,
        totalInputTokens,
        totalOutputTokens,
        avgTokensPerTask,
    };

    return { groups, stats };
}

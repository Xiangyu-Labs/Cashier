"use server";

import { db } from "@/lib/db";
import { taskRuns, sourceDocuments, type TaskRun, type SourceDocument } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";
import type { QueueItem, QueueItemStatus } from "../../types/queue-item";

/**
 * Stats for the task queue
 */
export interface TaskQueueStats {
    pendingCount: number;
    runningCount: number;
    failedCount: number;
    completedCount: number;
    anomalyCount: number;
    total: number;
    // Token stats
    totalInputTokens: number;
    totalOutputTokens: number;
    avgTokensPerTask: number;
}

/**
 * Result from getTaskQueueAction
 * Returns a flat list of QueueItems and statistics
 */
export interface TaskQueueResult {
    items: QueueItem[];
    stats: TaskQueueStats;
}

/**
 * Extract sourceDocumentId from task input
 */
function getSourceDocumentIdFromInput(input: unknown): string | undefined {
    if (typeof input === 'object' && input !== null && 'sourceDocumentId' in input) {
        const id = (input as { sourceDocumentId?: string }).sourceDocumentId;
        return id ?? undefined;
    }
    return undefined;
}

/**
 * Convert a TaskRun to a QueueItem
 */
function taskRunToQueueItem(task: TaskRun): QueueItem {
    const sourceDocumentId = getSourceDocumentIdFromInput(task.input);

    return {
        id: task.id,
        kind: 'task',
        status: task.status as QueueItemStatus,
        title: task.title,
        subtitle: task.error ?? undefined,
        progress: task.progress ?? undefined,
        createdAt: task.createdAt.toISOString(),
        sourceDocumentId,
        taskId: task.id,
        taskType: task.type,
    };
}

/**
 * Convert an anomaly SourceDocument to a QueueItem
 */
function anomalyDocToQueueItem(doc: SourceDocument): QueueItem {
    return {
        id: doc.id,
        kind: 'anomaly',
        status: 'anomaly',
        title: doc.title ?? 'Untitled Bill',
        subtitle: doc.anomalyReason ?? undefined,
        createdAt: doc.createdAt.toISOString(),
        sourceDocumentId: doc.id,
        taskId: undefined,
        taskType: undefined,
    };
}

/**
 * Get task queue data for the unified Task Queue Modal.
 * Returns a flat list of QueueItems with token statistics.
 *
 * Items are from two sources:
 * - task_runs table (pending, running, failed, completed)
 * - source_documents table (anomaly status)
 *
 * Tasks are filtered by ledgerId using the scopeId column.
 */
export async function getTaskQueueAction(ledgerId: string): Promise<TaskQueueResult> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    // Fetch active tasks for this ledger (filter at SQL level using scopeId column)
    const activeTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            inArray(taskRuns.status, ["pending", "running", "failed"]),
            eq(taskRuns.scopeId, ledgerId)
        ),
        orderBy: [desc(taskRuns.createdAt)],
    });

    // Fetch completed tasks for this ledger (filter at SQL level)
    const allCompletedTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.status, "completed"),
            eq(taskRuns.scopeId, ledgerId)
        ),
        orderBy: [desc(taskRuns.completedAt)],
        limit: 100, // Limit to avoid fetching thousands of completed tasks
    });

    // Get latest 5 completed
    const completedTasks = allCompletedTasks.slice(0, 5);

    // Fetch anomaly source documents (directly from source_documents table)
    const anomalyDocs = await db.query.sourceDocuments.findMany({
        where: and(
            eq(sourceDocuments.ledgerId, ledgerId),
            eq(sourceDocuments.status, "anomaly"),
            isNull(sourceDocuments.deletedAt)
        ),
        orderBy: [desc(sourceDocuments.createdAt)],
    });

    // Build flat items list
    const items: QueueItem[] = [];

    // Add active tasks
    for (const task of activeTasks) {
        items.push(taskRunToQueueItem(task));
    }

    // Add completed tasks
    for (const task of completedTasks) {
        items.push(taskRunToQueueItem(task));
    }

    // Add anomaly documents
    for (const doc of anomalyDocs) {
        items.push(anomalyDocToQueueItem(doc));
    }

    // Calculate counts
    const pendingCount = items.filter(i => i.status === 'pending').length;
    const runningCount = items.filter(i => i.status === 'running').length;
    const failedCount = items.filter(i => i.status === 'failed').length;
    const completedCount = allCompletedTasks.length; // Total count, not just the 5 shown
    const anomalyCount = items.filter(i => i.status === 'anomaly').length;

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
        pendingCount,
        runningCount,
        failedCount,
        completedCount,
        anomalyCount,
        total: pendingCount + runningCount + failedCount + anomalyCount,
        totalInputTokens,
        totalOutputTokens,
        avgTokensPerTask,
    };

    return { items, stats };
}

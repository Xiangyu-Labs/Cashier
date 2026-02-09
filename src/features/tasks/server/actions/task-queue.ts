"use server";

import { db } from "@/lib/db";
import { taskRuns, sourceDocuments, type TaskRun, type SourceDocument } from "@/lib/db/schema";
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
    /** Tasks that failed (status = 'failed') - excludes parse_source_document tasks */
    failed: SerializedTaskRun[];
    /** Recently completed tasks (status = 'completed', latest 5) */
    completed: SerializedTaskRun[];
    /** Anomaly source documents (from source_documents table) */
    anomaly: SerializedAnomalyBill[];
}

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

/** Serialized anomaly bill for client transport */
export interface SerializedAnomalyBill {
    id: string;
    title: string | null;
    anomalyReason: string | null;
    createdAt: string;
    /** Whether the document has images (for edit-retry dialog) */
    hasImages: boolean;
    /** Original text input (for edit-retry dialog) */
    text: string | null;
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

function serializeAnomalyBill(doc: SourceDocument): SerializedAnomalyBill {
    return {
        id: doc.id,
        title: doc.title,
        anomalyReason: doc.anomalyReason,
        createdAt: doc.createdAt.toISOString(),
        hasImages: Array.isArray(doc.imageUrls) && doc.imageUrls.length > 0,
        text: doc.text,
    };
}

/**
 * Get task queue data for the unified Task Queue Modal.
 * Returns tasks grouped by status with token statistics.
 * Also includes anomaly source documents from the source_documents table.
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

    // Group tasks by status
    // For failed tasks, exclude parse_source_document since those are shown in anomaly section
    const groups: TaskQueueGroups = {
        pending: [],
        running: [],
        failed: [],
        completed: completedTasks.map(serializeTaskRun),
        anomaly: anomalyDocs.map(serializeAnomalyBill),
    };

    for (const task of activeTasks) {
        const serialized = serializeTaskRun(task);
        if (task.status === "pending") {
            groups.pending.push(serialized);
        } else if (task.status === "running") {
            groups.running.push(serialized);
        } else if (task.status === "failed") {
            // For parse_source_document, the anomaly is shown in anomaly section
            // Still show the failed task for visibility/debugging
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
        anomalyCount: groups.anomaly.length,
        total: groups.pending.length + groups.running.length + groups.failed.length + groups.anomaly.length,
        totalInputTokens,
        totalOutputTokens,
        avgTokensPerTask,
    };

    return { groups, stats };
}

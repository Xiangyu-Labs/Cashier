"use server";

import { db } from "@/lib/db";
import { taskRuns, sourceDocuments, type TaskRun, type SourceDocument } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { desc, eq, and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { QueueItem, QueueItemStatus } from "../../types";

// Zod schemas for runtime validation
const QueueItemStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'anomaly']);

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
 * Uses type guard pattern for safe property access
 */
function getSourceDocumentIdFromInput(input: unknown): string | undefined {
    if (typeof input !== 'object' || input === null) {
        return undefined;
    }
    // Safe cast to Record for property access with type guard
    const obj = input as Record<string, unknown>;
    if ('sourceDocumentId' in obj && typeof obj.sourceDocumentId === 'string') {
        return obj.sourceDocumentId;
    }
    return undefined;
}

/**
 * Convert a TaskRun to a QueueItem
 * Validates status with Zod schema for runtime type safety
 */
function taskRunToQueueItem(task: TaskRun, sourceDocTitle?: string | null): QueueItem {
    const sourceDocumentId = getSourceDocumentIdFromInput(task.input);

    // Validate status with Zod (replaces type assertion)
    const parsedStatus = QueueItemStatusSchema.safeParse(task.status);
    const status: QueueItemStatus = parsedStatus.success ? parsedStatus.data : 'failed';

    // For completed parse_source_document tasks, append source document title
    let title = task.title;
    if (status === 'completed' && task.type === 'parse_source_document' && sourceDocTitle) {
        title = `解析原始凭证：${sourceDocTitle}`;
    }

    return {
        id: task.id,
        kind: 'task',
        status,
        title,
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
        title: doc.title ?? 'Untitled Source Document',
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
export const getTaskQueueAction = withLedgerAccess(async (ledgerId: string): Promise<TaskQueueResult> => {
    // Fetch active tasks for this ledger (filter at SQL level using scopeId column)
    const activeTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            inArray(taskRuns.status, ["pending", "running", "failed"]),
            eq(taskRuns.scopeId, ledgerId)
        ),
        orderBy: [desc(taskRuns.createdAt)],
    });

    // Fetch latest 5 completed tasks for display (token stats are calculated via SQL aggregation)
    const completedTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.status, "completed"),
            eq(taskRuns.scopeId, ledgerId)
        ),
        orderBy: [desc(taskRuns.completedAt)],
        limit: 5,
    });

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

    // Collect source document IDs from completed parse_source_document tasks
    const completedSourceDocIds = completedTasks
        .filter(task => task.type === 'parse_source_document')
        .map(task => getSourceDocumentIdFromInput(task.input))
        .filter((id): id is string => id !== undefined);

    // Fetch source document titles and statuses for completed tasks
    const sourceDocTitles = new Map<string, string | null>();
    const anomalySourceDocIds = new Set<string>();
    if (completedSourceDocIds.length > 0) {
        const docs = await db.query.sourceDocuments.findMany({
            where: inArray(sourceDocuments.id, completedSourceDocIds),
            columns: { id: true, title: true, status: true },
        });
        for (const doc of docs) {
            sourceDocTitles.set(doc.id, doc.title);
            // Track anomaly documents to exclude their completed tasks from the list
            if (doc.status === 'anomaly') {
                anomalySourceDocIds.add(doc.id);
            }
        }
    }

    // Add active tasks
    for (const task of activeTasks) {
        items.push(taskRunToQueueItem(task));
    }

    // Add completed tasks (exclude those whose source document is in anomaly state)
    for (const task of completedTasks) {
        const sourceDocId = getSourceDocumentIdFromInput(task.input);
        // Skip completed tasks whose source document is in anomaly state
        // (anomaly documents are shown separately in the anomaly section)
        if (sourceDocId && anomalySourceDocIds.has(sourceDocId)) {
            continue;
        }
        const sourceDocTitle = sourceDocId ? sourceDocTitles.get(sourceDocId) : undefined;
        items.push(taskRunToQueueItem(task, sourceDocTitle));
    }

    // Add anomaly documents
    for (const doc of anomalyDocs) {
        items.push(anomalyDocToQueueItem(doc));
    }

    // Calculate counts
    const pendingCount = items.filter(i => i.status === 'pending').length;
    const runningCount = items.filter(i => i.status === 'running').length;
    const failedCount = items.filter(i => i.status === 'failed').length;
    const anomalyCount = items.filter(i => i.status === 'anomaly').length;

    // Calculate token stats using SQL aggregation (more efficient than fetching all tasks)
    const tokenStatsResult = await db
        .select({
            totalInput: sql<number>`COALESCE(SUM(CAST(json_extract(token_usage, '$.total.input') AS INTEGER)), 0)`,
            totalOutput: sql<number>`COALESCE(SUM(CAST(json_extract(token_usage, '$.total.output') AS INTEGER)), 0)`,
            taskCount: sql<number>`COUNT(*)`,
        })
        .from(taskRuns)
        .where(and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.status, "completed"),
            eq(taskRuns.scopeId, ledgerId)
        ));

    const tokenStats = tokenStatsResult[0];
    const totalInputTokens = tokenStats?.totalInput ?? 0;
    const totalOutputTokens = tokenStats?.totalOutput ?? 0;
    const completedCount = tokenStats?.taskCount ?? 0;

    const totalTokens = totalInputTokens + totalOutputTokens;
    const avgTokensPerTask = completedCount > 0 ? Math.round(totalTokens / completedCount) : 0;

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
});

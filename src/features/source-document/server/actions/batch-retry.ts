"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { prepareSourceDocumentTask } from "./helpers";
import { UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Batch retry multiple source documents
 */
export async function batchRetrySourceDocumentsAction(
    ledgerId: string,
    sourceDocumentIds: string[]
): Promise<void> {
    const { ledger, error } = await requireLedgerAccess(ledgerId);
    if (error) throw new UnauthorizedError();

    if (sourceDocumentIds.length === 0) {
        logger.debug({ ledgerId }, "Batch retry called with empty document list");
        return;
    }

    const q = forLedger(sourceDocuments, ledgerId);

    // 1. Fetch all docs to get their current text/images
    const docs = await db.query.sourceDocuments.findMany({
        where: and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        )
    });

    // 2. Find all related task_runs before transaction
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.scopeId, ledgerId),
            eq(taskRuns.entityType, 'source_document'),
            inArray(taskRuns.entityId, sourceDocumentIds)
        ),
    });

    // Cancel any running/pending tasks before retrying
    const runningTasks = relatedTaskRuns.filter(
        task => task.status === 'pending' || task.status === 'running'
    );
    for (const task of runningTasks) {
        await flowEngine.cancel(task.id);
    }

    const taskIdsToDelete = relatedTaskRuns.map(t => t.id);

    // 3. Atomically delete old task_runs and reset document status in a transaction
    // Note: better-sqlite3 uses synchronous transactions (no await needed)
    db.transaction((tx) => {
        // 3a. Soft delete old task_runs for these source documents
        if (taskIdsToDelete.length > 0) {
            tx.update(taskRuns)
                .set({ deletedAt: new Date() })
                .where(inArray(taskRuns.id, taskIdsToDelete))
                .run();
        }

        // 3b. Update status to queued and clear anomaly fields
        tx.update(sourceDocuments)
            .set({ status: "queued", anomalyReason: null })
            .where(and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            ))
            .run();
    });

    // 4. Retrigger tasks for each using Promise.allSettled to handle partial failures
    const results = await Promise.allSettled(docs.map(async (doc) => {
        const images = doc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" })) || [];
        await prepareSourceDocumentTask(ledgerId, ledger, doc.text || undefined, images, doc.id);
    }));

    // Log any failures but don't fail the entire batch
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
        logger.warn(
            { ledgerId, failedCount: failures.length, totalCount: docs.length },
            "Some documents failed to retry in batch operation"
        );
    }
}

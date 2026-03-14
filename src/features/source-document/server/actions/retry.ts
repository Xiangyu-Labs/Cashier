"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { prepareSourceDocumentTask, processImages } from "./helpers";
import type { SourceDocument } from "@/lib/db/schema";
import type { SourceDocumentActionInput } from "./types";

/**
 * Retry an existing source document with optional new data
 */
export async function retrySourceDocumentAction(
    ledgerId: string,
    sourceDocumentId: string,
    input?: SourceDocumentActionInput
) {
    const { ledger, error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized or Ledger not found");

    const q = forLedger(sourceDocuments, ledgerId);

    // Verify document belongs to ledger
    const existingDoc = await db.query.sourceDocuments.findFirst({
        where: q.whereId(sourceDocumentId)
    });
    if (!existingDoc) throw new Error("Source document not found");

    // Cancel any running/pending tasks for this source document before retrying
    const runningTasks = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.entityType, 'source_document'),
            eq(taskRuns.entityId, sourceDocumentId),
            eq(taskRuns.scopeId, ledgerId),
            inArray(taskRuns.status, ['pending', 'running'])
        ),
    });
    for (const task of runningTasks) {
        await flowEngine.cancel(task.id);
    }

    const text = input?.text || existingDoc.text || undefined;
    const images = input?.images;

    // Update status to queued and clear anomaly fields
    const updatePayload: Partial<SourceDocument> = { status: "queued", anomalyReason: null };

    // Process new images: upload to R2 if enabled
    let processedImageUrls: string[] | undefined;
    if (images) {
        processedImageUrls = await processImages(images, ledgerId, sourceDocumentId);
        updatePayload.imageUrls = processedImageUrls;
    }

    // If new text provided, update the document record
    if (input) {
        if (input.text !== undefined) updatePayload.text = input.text;
    }

    // Atomically delete old task_runs and reset document status in a transaction
    db.transaction((tx) => {
        // 1. Soft delete old failed/completed task_runs for this source document
        tx.update(taskRuns)
            .set({ deletedAt: new Date() })
            .where(and(
                isNull(taskRuns.deletedAt),
                eq(taskRuns.entityType, 'source_document'),
                eq(taskRuns.entityId, sourceDocumentId),
                eq(taskRuns.scopeId, ledgerId)
            ))
            .run();

        // 2. Update document status to queued and apply any new data
        tx.update(sourceDocuments)
            .set(updatePayload)
            .where(q.whereId(sourceDocumentId))
            .run();
    });

    // Use processed images if provided, otherwise use existing imageUrls
    const finalImages = processedImageUrls
        ? processedImageUrls.map(url => ({ data: url, mimeType: "image/jpeg" }))
        : existingDoc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }));

    await prepareSourceDocumentTask(ledgerId, ledger, text, finalImages, sourceDocumentId);

    return {
        sourceDocumentId,
        status: "queued" as const,
    };
}

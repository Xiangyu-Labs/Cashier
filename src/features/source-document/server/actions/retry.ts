"use server";

import { db } from "@/lib/db";
import { sourceDocuments, taskRuns } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { prepareSourceDocumentTask, processImages } from "./helpers";
import { logger } from "@/lib/logger";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import type { SourceDocumentActionInput } from "./types";

/**
 * Retry an existing source document with optional new data
 *
 * New approach: Edit retry = soft delete old document + create brand new document
 * This decouples "cancel task" from "retain/delete document" logic:
 * - Real cancel: call cancelTaskAction → cancel task + soft delete document
 * - Edit retry: call retrySourceDocumentAction → soft delete old + create new + submit new task
 */
export async function retrySourceDocumentAction(
    ledgerId: string,
    sourceDocumentId: string,
    input?: SourceDocumentActionInput
) {
    const { ledger, error } = await requireLedgerAccess(ledgerId);
    if (error) throw new UnauthorizedError();

    const q = forLedger(sourceDocuments, ledgerId);

    // 1. Get old document data
    const existingDoc = await db.query.sourceDocuments.findFirst({
        where: q.whereId(sourceDocumentId)
    });
    if (!existingDoc) throw new NotFoundError("Source document");

    // 2. Create new document with new ID, preserving only ledgerId and entryDate
    const newDocId = crypto.randomUUID();
    const text = input?.text || existingDoc.text || undefined;
    const images = input?.images;

    // Process new images if provided
    let processedImageUrls: string[] | undefined;
    if (images) {
        processedImageUrls = await processImages(images, ledgerId, newDocId);
    }

    // Prepare final image URLs: use processed images if provided, otherwise use existing
    const finalImageUrls = processedImageUrls && processedImageUrls.length > 0
        ? processedImageUrls
        : existingDoc.imageUrls || [];

    // Insert new document
    await db.insert(sourceDocuments).values({
        id: newDocId,
        ledgerId: ledgerId,
        entryDate: existingDoc.entryDate,
        text: text,
        imageUrls: finalImageUrls,
        status: "queued",
        type: "ai_parsed",
        title: null, // Let AI regenerate title
        metadata: {}, // Empty metadata for fresh parse
    });

    logger.debug(
        { oldDocId: sourceDocumentId, newDocId, ledgerId },
        "Created new source document for retry"
    );

    // 3. Soft delete old document
    await db.update(sourceDocuments)
        .set({ deletedAt: new Date() })
        .where(q.whereId(sourceDocumentId));

    logger.debug(
        { oldDocId: sourceDocumentId, ledgerId },
        "Soft deleted old source document for retry"
    );

    // 4. Cancel any running/pending tasks for the OLD source document
    // Note: handleParseCancel will be triggered but the old doc is already soft deleted
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

    // 5. Soft delete old task_runs for the old document (clean up)
    await db.update(taskRuns)
        .set({ deletedAt: new Date() })
        .where(and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.entityType, 'source_document'),
            eq(taskRuns.entityId, sourceDocumentId),
            eq(taskRuns.scopeId, ledgerId)
        ));

    // 6. Submit new task for the NEW document
    const finalImages = finalImageUrls.map(url => ({ data: url, mimeType: "image/jpeg" }));
    await prepareSourceDocumentTask(ledgerId, ledger, text, finalImages, newDocId);

    logger.debug(
        { newDocId, ledgerId },
        "Submitted new parse task for retried document"
    );

    // 7. Return new document ID (frontend needs to update reference)
    return {
        sourceDocumentId: newDocId,
        status: "queued" as const,
    };
}

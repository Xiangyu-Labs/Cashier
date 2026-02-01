"use server";

import { db } from "@/lib/db";
import { entryCategories, sourceDocuments } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";
import { submitFlowTask } from "@/lib/flow/producer";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "@/lib/tasks/parse-source-document";
import { revalidatePath } from "next/cache";
import { desc, lte, gte, inArray, and, eq } from "drizzle-orm";

export interface SourceDocumentActionInput {
    text?: string;
    images?: { data: string; mimeType: string }[];
}

/**
 * Common logic to normalize images and prepare task data
 */
async function prepareSourceDocumentTask(ledgerId: string, ledger: any, text: string | undefined, images: { data: string; mimeType: string }[] | undefined, sourceDocumentId: string) {
    const imageUrls: string[] = [];
    if (images) {
        images.forEach((img) => {
            let data = img.data;
            if (!data.startsWith("data:") && !data.startsWith("http")) {
                data = `data:image/jpeg;base64,${data}`;
            }
            imageUrls.push(data);
        });
    }

    const categories = await db.query.entryCategories.findMany({
        where: (table, { eq, or, isNull }) => or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId))
    });

    await submitFlowTask({
        type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
        title: text ? `解析: ${text.slice(0, 20)}...` : "解析图片账单",
        ledgerId: ledgerId,
        data: {
            sourceDocumentId: sourceDocumentId,
            text: text,
            imageUrls: imageUrls,
            aiLanguage: ledger.aiLanguage,
            preferredCurrencies: ledger.currencies || undefined,
            categories: categories,
            settings: {
                mergeSimilarItems: ledger.mergeSimilarItems,
                autoRecognizeDate: ledger.autoRecognizeDate,
                aiCustomPrompt: ledger.aiCustomPrompt,
            },
        },
    });

    return imageUrls;
}

/**
 * Create a new source document and trigger processing
 */
export async function createSourceDocumentAction(ledgerId: string, input: SourceDocumentActionInput) {
    try {
        const { text, images } = input;
        if (!text && (!images || images.length === 0)) {
            throw new Error("At least one input (text or images) is required");
        }

        const { scope, ledger, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized or Ledger not found");

        // Save source document with 'queued' status using scope repository
        const savedDoc = await scope.documents.create({
            text: text || null,
            imageUrls: [], // Will update after normalization if needed, though prepare handles it for the task
            status: "queued",
        } as any);

        const imageUrls = await prepareSourceDocumentTask(ledgerId, ledger, text, images, savedDoc.id);

        // Update with normalized image URLs if any
        if (imageUrls.length > 0) {
            await scope.documents.update(savedDoc.id, { imageUrls });
        }

        revalidatePath(`/ledger/${ledgerId}`);

        return {
            success: true,
            sourceDocumentId: savedDoc.id,
            status: "queued",
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to create source document via action");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to queue source document",
        };
    }
}

/**
 * Retry an existing source document with optional new data
 */
export async function retrySourceDocumentAction(ledgerId: string, sourceDocumentId: string, input?: SourceDocumentActionInput) {
    try {
        const { scope, ledger, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized or Ledger not found");

        // Verify document belongs to ledger
        const existingDoc = await scope.documents.get(sourceDocumentId);
        if (!existingDoc) throw new Error("Source document not found");

        const text = input?.text || existingDoc.text || undefined;
        // If new images provided, use them, otherwise use existing ones (converting URLs back to data if necessary is not ideal, 
        // but here we expect input to be provided if images are changing)
        const images = input?.images;

        // Update status to queued
        await scope.documents.update(sourceDocumentId, { status: "queued" });

        // If new text/images provided, update the document record
        if (input) {
            const updatePayload: any = {};
            if (input.text !== undefined) updatePayload.text = input.text;
            // Note: images normalization happens in prepareSourceDocumentTask
            await scope.documents.update(sourceDocumentId, updatePayload);
        }

        // We use the existing imageUrls if no new ones are provided
        const finalImages = images || existingDoc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }));

        await prepareSourceDocumentTask(ledgerId, ledger, text, finalImages, sourceDocumentId);

        revalidatePath(`/ledger/${ledgerId}`);

        return {
            success: true,
            sourceDocumentId,
            status: "queued",
        };
    } catch (error) {
        logger.error({ error, ledgerId, sourceDocumentId }, "Failed to retry source document via action");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to retry source document",
        };
    }
}

/**
 * Update source document metadata (e.g. title)
 */
export async function updateSourceDocumentAction(ledgerId: string, sourceId: string, data: { title: string }) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        await scope.documents.update(sourceId, data);
        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, sourceId }, "Failed to update source document via action");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update source document",
        };
    }
}

export async function deleteSourceDocumentAction(ledgerId: string, sourceId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        await scope.documents.delete(sourceId);
        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, sourceId }, "Failed to delete source document via action");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete source document",
        };
    }
}

export async function getSourceDocumentsAction(ledgerId: string, params: {
    status?: string | null;
    limit?: number;
    cursor?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const { status, limit = 20, cursor, startDate, endDate } = params;
    const conditions = [];

    if (status) {
        const statuses = status.split(",").filter(Boolean);
        if (statuses.length > 0) {
            conditions.push(inArray(sourceDocuments.status, statuses as any[]));
        }
    }

    if (cursor) {
        conditions.push(lte(sourceDocuments.createdAt, new Date(cursor)));
    }

    if (startDate) {
        conditions.push(gte(sourceDocuments.createdAt, new Date(startDate)));
    }
    if (endDate) {
        conditions.push(lte(sourceDocuments.createdAt, new Date(endDate)));
    }

    const result = await scope.documents.findMany({
        where: and(...conditions),
        orderBy: [desc(sourceDocuments.createdAt)],
        limit: limit + 1,
    });

    let nextCursor = null;
    if (result.length > limit) {
        const nextItem = result.pop();
        if (nextItem) {
            nextCursor = nextItem.createdAt.toISOString();
        }
    }

    return {
        items: result.map(item => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            status: item.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
        })),
        nextCursor,
    };
}

export async function getSourceDocumentAction(ledgerId: string, sourceDocumentId: string) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const doc = await scope.documents.get(sourceDocumentId);
    if (!doc) return null;

    return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        status: doc.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
    };
}

"use server";

import { db } from "@/lib/db";
import { entryCategories, sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { submitFlowTask } from "@/lib/flow/producer";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import { revalidatePath } from "next/cache";
import { desc, lte, gte, inArray, and, eq } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";

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
        where: (table, { eq, or, isNull, and }) => and(
            or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId)),
            isNull(table.deletedAt)
        )
    });

    const settings = ledger.metadata?.settings || {};

    await submitFlowTask({
        type: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
        title: text ? `解析: ${text.slice(0, 20)}...` : "解析图片账单",
        ledgerId: ledgerId,
        data: {
            sourceDocumentId: sourceDocumentId,
            text: text,
            imageUrls: imageUrls,
            aiLanguage: settings.aiLanguage || "zh-CN",
            preferredCurrencies: settings.currencies || undefined,
            categories: categories,
            settings: {
                mergeSimilarItems: settings.mergeSimilarItems,
                autoRecognizeDate: settings.autoRecognizeDate,
                aiCustomPrompt: settings.aiCustomPrompt,
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
            status: "queued" as const,
            error: null,
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to create source document via action");
        return {
            success: false,
            error: safeError(error),
            sourceDocumentId: null,
            status: null,
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

            // Fix: Store updated images in DB if provided
            if (images) {
                // Convert input images to imageUrls format (data URI) for storage/usage
                // Note: DB usually stores array of strings. 
                // The normalize happens in prepareSourceDocumentTask but meaningful persistence should happen here.
                // However, scope.documents.update expects the schema format.

                // We need to map images {data, mimeType} to string[] usually. 
                // Assuming data is arguably the URL/Base64.

                const newImageUrls = images.map(img => {
                    let data = img.data;
                    if (!data.startsWith("data:") && !data.startsWith("http")) {
                        return `data:${img.mimeType};base64,${data}`;
                    }
                    return data;
                });
                updatePayload.imageUrls = newImageUrls;
            }

            await scope.documents.update(sourceDocumentId, updatePayload);
        }

        // We use the existing imageUrls if no new ones are provided
        // Use the updated doc we just potentially patched, or logic:
        const finalImages = images || existingDoc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }));

        // Fix: Delete existing ledger entries to prevent idempotency check from blocking new results
        await scope.entries.deleteMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceDocumentId)
        });

        await prepareSourceDocumentTask(ledgerId, ledger, text, finalImages, sourceDocumentId);

        revalidatePath(`/ledger/${ledgerId}`);

        return {
            success: true,
            sourceDocumentId,
            status: "queued" as const,
            error: null,
        };
    } catch (error) {
        logger.error({ error, ledgerId, sourceDocumentId }, "Failed to retry source document via action");
        return {
            success: false,
            error: safeError(error),
            sourceDocumentId: null,
            status: null,
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
        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId, sourceId }, "Failed to update source document via action");
        return {
            success: false,
            error: safeError(error),
        };
    }
}

export async function deleteSourceDocumentAction(ledgerId: string, sourceId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        // Cascade soft delete to ledger entries
        await scope.entries.deleteMany({
            where: eq(ledgerEntries.sourceDocumentId, sourceId)
        });
        await scope.documents.delete(sourceId);
        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId, sourceId }, "Failed to delete source document via action");
        return {
            success: false,
            error: safeError(error),
        };
    }
}

export async function getSourceDocumentsAction(ledgerId: string, params: {
    status?: string | null;
    limit?: number;
    cursor?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    includeLedgerEntries?: boolean;
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
        const [cursorCreated, cursorId] = cursor.split('|');
        if (cursorCreated && cursorId) {
            conditions.push(lte(sourceDocuments.createdAt, new Date(cursorCreated)));
        } else {
            conditions.push(lte(sourceDocuments.createdAt, new Date(cursor)));
        }
    }

    if (startDate) {
        conditions.push(gte(sourceDocuments.createdAt, new Date(startDate)));
    }
    if (endDate) {
        conditions.push(lte(sourceDocuments.createdAt, new Date(endDate)));
    }

    const result = await scope.documents.findMany({
        where: and(...conditions),
        orderBy: [desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        limit: limit + 1,
    });

    // Tie-breaking filtering
    let filteredResult = result;
    if (cursor) {
        const [cursorCreated, cursorId] = cursor.split('|');
        if (cursorCreated && cursorId) {
            const cursorVal = new Date(cursorCreated).getTime();
            filteredResult = result.filter(item => {
                const itemVal = item.createdAt.getTime();
                if (itemVal < cursorVal) return true;
                if (itemVal > cursorVal) return false;
                return item.id < cursorId;
            });
        }
    }


    let nextCursor = null;
    if (filteredResult.length > limit) {
        const nextItem = filteredResult[limit];
        nextCursor = `${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        filteredResult = filteredResult.slice(0, limit);
    }

    // Fetch ledger entries if requested
    let entriesByDocId = new Map<string, any[]>();
    if (params.includeLedgerEntries && filteredResult.length > 0) {
        const docIds = filteredResult.map(d => d.id);
        const entries = await scope.entries.findMany({
            where: inArray(ledgerEntries.sourceDocumentId, docIds),
            with: { category: true }
        });

        entries.forEach(entry => {
            const docId = entry.sourceDocumentId;
            if (docId) {
                const existing = entriesByDocId.get(docId) || [];
                existing.push({
                    ...entry,
                    amount: String(entry.amount),
                    createdAt: entry.createdAt.toISOString(),
                    entryDate: entry.entryDate ? entry.entryDate.toISOString() : null,
                });
                entriesByDocId.set(docId, existing);
            }
        });
    }

    return {
        items: filteredResult.map(item => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            status: item.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
            ledgerEntries: params.includeLedgerEntries ? (entriesByDocId.get(item.id) || []) : undefined,
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

export async function batchDeleteSourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[]) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        // Cascade soft delete to associated ledger entries
        await scope.entries.deleteMany({
            where: inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)
        });
        await scope.documents.batchDelete(sourceDocumentIds);
        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId, count: sourceDocumentIds.length }, "Failed to batch delete source documents");
        return {
            success: false,
            error: safeError(error),
        };
    }
}

export async function batchRetrySourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[]) {
    try {
        const { scope, ledger, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        // 1. Fetch all docs to get their current text/images
        const docs = await scope.documents.findMany({
            where: inArray(sourceDocuments.id, sourceDocumentIds)
        });

        // 2. Update status to queued
        await scope.documents.batchUpdate(sourceDocumentIds, { status: "queued" });

        // 3. Retrigger tasks for each
        await Promise.all(docs.map(async (doc) => {
            // Re-prepare task. 
            // Note: We are not changing text/images here, just re-running with existing data.
            // We need to convert existing imageUrls back to format needed? 
            // Actually prepareSourceDocumentAction can handle existing URLs if we structure it right, 
            // but prepareSourceDocumentTask implementation expects {data, mimeType}.

            // However, look at retrySourceDocumentAction:
            // const finalImages = images || existingDoc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }));
            // We should do similar.
            const images = doc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" })) || [];
            await prepareSourceDocumentTask(ledgerId, ledger, doc.text || undefined, images, doc.id);
        }));

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId, count: sourceDocumentIds.length }, "Failed to batch retry source documents");
        return {
            success: false,
            error: safeError(error),
        };
    }
}

export interface SourceDocumentGroup {
    sourceDocument: any;
    ledgerEntries: any[];
}

export interface GroupedSourceDocuments {
    processing: SourceDocumentGroup[];
    anomaly: SourceDocumentGroup[];
    completed: SourceDocumentGroup[];
}

/**
 * Unified action to fetch grouped source documents.
 * This moves the grouping logic from client to server for better performance and consistency.
 */
export async function getUnifiedSourceDocumentsAction(ledgerId: string, params: {
    startDate?: string | null;
    endDate?: string | null;
    limit?: number;
    cursor?: string | null;
}) {
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    try {

        const { startDate, endDate, limit = 20, cursor } = params;

        // 1. Fetch active documents (queued, processing, anomaly)
        // For active docs, we might want to ignore date range if they are "active"
        // but the plan says "Server-side filtering for ALL sections".
        // Let's apply date range to all.
        const activeDocsResult = await getSourceDocumentsAction(ledgerId, {
            status: 'queued,processing,anomaly',
            includeLedgerEntries: true,
            startDate,
            endDate,
        });

        // 2. Fetch completed documents (paginated)
        const completedDocsResult = await getSourceDocumentsAction(ledgerId, {
            status: 'completed',
            includeLedgerEntries: true,
            startDate,
            endDate,
            limit,
            cursor,
        });

        const groups: GroupedSourceDocuments = {
            processing: [],
            anomaly: [],
            completed: [],
        };

        activeDocsResult.items.forEach((doc: any) => {
            const group = {
                sourceDocument: doc,
                ledgerEntries: doc.ledgerEntries || [],
            };
            if (doc.status === 'anomaly') {
                groups.anomaly.push(group);
            } else {
                groups.processing.push(group);
            }
        });

        completedDocsResult.items.forEach((doc: any) => {
            groups.completed.push({
                sourceDocument: doc,
                ledgerEntries: doc.ledgerEntries || [],
            });
        });

        return {
            groups,
            nextCursor: completedDocsResult.nextCursor,
            stats: {
                processingCount: groups.processing.length,
                anomalyCount: groups.anomaly.length,
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get unified source documents");
        throw new Error(safeError(error));
    }
}

export async function batchUpdateSourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[], data: { status?: string, title?: string }) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        await scope.documents.batchUpdate(sourceDocumentIds, data as any);
        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, error: null };
    } catch (error) {
        logger.error({ error, ledgerId, count: sourceDocumentIds.length }, "Failed to batch update source documents");
        return {
            success: false,
            error: safeError(error),
        };
    }
}

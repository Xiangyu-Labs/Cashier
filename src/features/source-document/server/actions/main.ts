"use server";

import { db } from "@/lib/db";
import { entryCategories, sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { submitFlowTask } from "@/lib/flow/producer";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import { revalidatePath } from "next/cache";
import { desc, lte, gte, inArray, and, eq, isNull } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";
import { forLedger } from "@/lib/db/scoped-query";

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

        const { ledger, error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized or Ledger not found");

        const q = forLedger(sourceDocuments, ledgerId);

        // Save source document with 'queued' status
        const [savedDoc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId, // Explicitly set ledgerId
            text: text || null,
            imageUrls: [], // Will update after normalized
            status: "queued",
        }).returning();

        const imageUrls = await prepareSourceDocumentTask(ledgerId, ledger, text, images, savedDoc.id);

        // Update with normalized image URLs if any
        if (imageUrls.length > 0) {
            await db.update(sourceDocuments)
                .set({ imageUrls })
                .where(q.whereId(savedDoc.id));
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
        const { ledger, error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized or Ledger not found");

        const q = forLedger(sourceDocuments, ledgerId);

        // Verify document belongs to ledger
        const existingDoc = await db.query.sourceDocuments.findFirst({
            where: q.whereId(sourceDocumentId)
        });
        if (!existingDoc) throw new Error("Source document not found");

        const text = input?.text || existingDoc.text || undefined;
        const images = input?.images;

        // Update status to queued
        const updatePayload: any = { status: "queued" };

        // If new text/images provided, update the document record
        if (input) {
            if (input.text !== undefined) updatePayload.text = input.text;

            if (images) {
                const newImageUrls = images.map(img => {
                    let data = img.data;
                    if (!data.startsWith("data:") && !data.startsWith("http")) {
                        return `data:${img.mimeType};base64,${data}`;
                    }
                    return data;
                });
                updatePayload.imageUrls = newImageUrls;
            }
        }

        await db.update(sourceDocuments)
            .set(updatePayload)
            .where(q.whereId(sourceDocumentId));

        // Use the updated doc we just potentially patched, or logic:
        const finalImages = images || existingDoc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" }));



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
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized");

        const q = forLedger(sourceDocuments, ledgerId);

        await db.update(sourceDocuments)
            .set(data)
            .where(q.whereId(sourceId));

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
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized");

        const q = forLedger(sourceDocuments, ledgerId);
        const qEntries = forLedger(ledgerEntries, ledgerId);

        // Cascade soft delete to ledger entries
        await db.update(ledgerEntries)
            .set(qEntries.softDelete)
            .where(and(
                qEntries.whereActive,
                eq(ledgerEntries.sourceDocumentId, sourceId)
            ));

        await db.update(sourceDocuments)
            .set(q.softDelete)
            .where(q.whereId(sourceId));

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
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const { status, limit = 20, cursor, startDate, endDate } = params;
    const q = forLedger(sourceDocuments, ledgerId);

    // Base condition: Active documents in this ledger
    const conditions = [q.whereActive];

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

    // Use db.query for relation fetching if strict type safety needed, but manual join/separate query 
    // is often better for complex filtering. Here we used findMany in repo.
    // Drizzle query builder findMany:
    const result = await db.query.sourceDocuments.findMany({
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
        const qEntries = forLedger(ledgerEntries, ledgerId);

        const entries = await db.query.ledgerEntries.findMany({
            where: and(
                qEntries.whereActive,
                inArray(ledgerEntries.sourceDocumentId, docIds)
            ),
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
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const q = forLedger(sourceDocuments, ledgerId);
    const doc = await db.query.sourceDocuments.findFirst({
        where: q.whereId(sourceDocumentId)
    });

    if (!doc) return null;

    return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        status: doc.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
    };
}

export async function batchDeleteSourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[]) {
    try {
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        const q = forLedger(sourceDocuments, ledgerId);
        const qEntries = forLedger(ledgerEntries, ledgerId);

        // Cascade soft delete to associated ledger entries
        await db.update(ledgerEntries)
            .set(qEntries.softDelete)
            .where(and(
                qEntries.whereActive,
                inArray(ledgerEntries.sourceDocumentId, sourceDocumentIds)
            ));

        await db.update(sourceDocuments)
            .set(q.softDelete)
            .where(and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            ));

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
        const { ledger, error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        const q = forLedger(sourceDocuments, ledgerId);

        // 1. Fetch all docs to get their current text/images
        const docs = await db.query.sourceDocuments.findMany({
            where: and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            )
        });

        // 2. Update status to queued
        await db.update(sourceDocuments)
            .set({ status: "queued" })
            .where(and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            ));

        // 3. Retrigger tasks for each
        await Promise.all(docs.map(async (doc) => {
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
 */
export async function getUnifiedSourceDocumentsAction(ledgerId: string, params: {
    startDate?: string | null;
    endDate?: string | null;
    limit?: number;
    cursor?: string | null;
}) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    try {
        const { startDate, endDate, limit = 20, cursor } = params;

        // 1. Fetch active documents (queued, processing, anomaly)
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
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) throw new Error("Unauthorized");

        if (sourceDocumentIds.length === 0) return { success: true };

        const q = forLedger(sourceDocuments, ledgerId);

        await db.update(sourceDocuments)
            .set(data as any)
            .where(and(
                q.whereActive,
                inArray(sourceDocuments.id, sourceDocumentIds)
            ));

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

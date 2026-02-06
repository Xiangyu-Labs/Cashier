"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { desc, lte, gte, inArray, and, eq, isNull, or, lt } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeStart, parseDateRangeEnd } from "@/lib/date-utils";

export interface SourceDocumentActionInput {
    text?: string;
    images?: { data: string; mimeType: string }[];
}

/**
 * Common logic to normalize images and prepare task data
 */
import { type Ledger, type LedgerEntry, type SourceDocument } from "@/lib/db/schema";

/**
 * Common logic to normalize images and prepare task data
 */
async function prepareSourceDocumentTask(ledgerId: string, ledger: Ledger, text: string | undefined, images: { data: string; mimeType: string }[] | undefined, sourceDocumentId: string) {
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

    await flowEngine.submit(
        TASK_TYPE_PARSE_SOURCE_DOCUMENT,
        {
            ledgerId: ledgerId,
            sourceDocumentId: sourceDocumentId,
            text: text,
            imageUrls: imageUrls,
            aiLanguage: settings.aiLanguage || "zh-CN",
            preferredCurrencies: settings.currencies || undefined,
            categories: categories,
            settings: {
                aiCustomPrompt: settings.aiCustomPrompt,
            },
        },
        {
            title: text ? `解析: ${text.slice(0, 20)}...` : "解析图片账单",
        }
    );

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
        const today = new Date().toISOString().split('T')[0]; // yyyy-MM-dd format
        const [savedDoc] = await db.insert(sourceDocuments).values({
            ledgerId: ledgerId, // Explicitly set ledgerId
            text: text || null,
            imageUrls: [], // Will update after normalized
            status: "queued",
            entryDate: today,
        }).returning();

        const imageUrls = await prepareSourceDocumentTask(ledgerId, ledger, text, images, savedDoc.id);

        // Update with normalized image URLs if any
        if (imageUrls.length > 0) {
            await db.update(sourceDocuments)
                .set({ imageUrls })
                .where(q.whereId(savedDoc.id));
        }


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
        const updatePayload: Partial<SourceDocument> = { status: "queued" };

        // If new text/images provided, update the document record
        if (input) {
            if (input.text !== undefined) updatePayload.text = input.text;

            if (images) {
                const newImageUrls = images.map(img => {
                    const data = img.data;
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
 * Update source document metadata (e.g. title, entryDate)
 */
export async function updateSourceDocumentAction(ledgerId: string, sourceId: string, data: { title?: string; entryDate?: string }): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(sourceDocuments, ledgerId);

    await db.update(sourceDocuments)
        .set({ ...data, updatedAt: new Date() })
        .where(q.whereId(sourceId));
}

export async function deleteSourceDocumentAction(ledgerId: string, sourceId: string): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(sourceDocuments, ledgerId);
    const qEntries = forLedger(ledgerEntries, ledgerId);

    // Cascade soft delete to ledger entries
    await db.update(ledgerEntries)
        .set(qEntries.softDelete)
        .where(and(
            qEntries.whereActive,
            eq(ledgerEntries.sourceDocumentId, sourceId)
        ));

    // Cascade soft delete to task_runs that reference this source document
    // Since task_runs.input contains sourceDocumentId, we fetch and filter
    const { taskRuns } = await import("@/lib/db/schema");
    const allTaskRuns = await db.query.taskRuns.findMany({
        where: isNull(taskRuns.deletedAt),
    });

    const taskIdsToDelete = allTaskRuns
        .filter(task => {
            const input = task.input as { sourceDocumentId?: string } | null;
            return input?.sourceDocumentId === sourceId;
        })
        .map(task => task.id);

    if (taskIdsToDelete.length > 0) {
        await db.update(taskRuns)
            .set({ deletedAt: new Date() })
            .where(inArray(taskRuns.id, taskIdsToDelete));
    }

    await db.update(sourceDocuments)
        .set(q.softDelete)
        .where(q.whereId(sourceId));
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

    const { status, limit = 20, startDate, endDate } = params;
    const q = forLedger(sourceDocuments, ledgerId);

    // Build conditions
    const conditions = [q.whereActive];

    if (status) {
        const statuses = status.split(",").filter(Boolean);
        if (statuses.length > 0) {
            conditions.push(inArray(sourceDocuments.status, statuses as ("queued" | "processing" | "completed" | "anomaly")[]));
        }
    }

    if (startDate) {
        const parsedStart = parseDateRangeStart(startDate);
        if (parsedStart) conditions.push(gte(sourceDocuments.createdAt, parsedStart));
    }
    if (endDate) {
        const parsedEnd = parseDateRangeEnd(endDate);
        if (parsedEnd) conditions.push(lte(sourceDocuments.createdAt, parsedEnd));
    }

    // Handle cursor with precise composite condition
    // Cursor format: "entryDate|createdAt|id"
    // Order: (entryDate DESC, createdAt DESC, id DESC)
    // Condition: (entryDate, createdAt, id) < (cursorDate, cursorCreated, cursorId)
    if (params.cursor) {
        const parts = params.cursor.split('|');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            const [cursorDate, cursorCreated, cursorId] = parts;
            // Use precise composite condition
            conditions.push(
                or(
                    lt(sourceDocuments.entryDate, cursorDate),
                    and(
                        eq(sourceDocuments.entryDate, cursorDate),
                        lt(sourceDocuments.createdAt, new Date(cursorCreated))
                    ),
                    and(
                        eq(sourceDocuments.entryDate, cursorDate),
                        eq(sourceDocuments.createdAt, new Date(cursorCreated)),
                        lt(sourceDocuments.id, cursorId)
                    )
                )!
            );
        } else if (parts.length === 2 && parts[0] && parts[1]) {
            // Fallback: old format with createdAt|id
            const [cursorCreated, cursorId] = parts;
            conditions.push(
                or(
                    lt(sourceDocuments.createdAt, new Date(cursorCreated)),
                    and(
                        eq(sourceDocuments.createdAt, new Date(cursorCreated)),
                        lt(sourceDocuments.id, cursorId)
                    )
                )!
            );
        }
    }

    // Single query with precise conditions - no manual filtering needed!
    const items = await db.query.sourceDocuments.findMany({
        where: and(...conditions),
        orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        limit: limit + 1,
    });

    // Determine next cursor
    let nextCursor: string | null = null;
    let resultItems = items;

    if (items.length > limit) {
        const nextItem = items[limit];
        const nextDate = nextItem.entryDate || '0000-00-00';
        nextCursor = `${nextDate}|${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        resultItems = items.slice(0, limit);
    }

    // Fetch ledger entries if requested
    const entriesByDocId = new Map<string, SourceDocumentGroup['ledgerEntries']>();
    if (params.includeLedgerEntries && resultItems.length > 0) {
        const docIds = resultItems.map(d => d.id);
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
                    updatedAt: entry.updatedAt.toISOString(),
                    entryDate: entry.entryDate,
                } as unknown as SourceDocumentGroup['ledgerEntries'][number]);
                entriesByDocId.set(docId, existing);
            }
        });
    }

    return {
        items: resultItems.map(item => {
            const { aiRawResponse: _aiRawResponse, rawOcrText: _rawOcrText, ...lightMetadata } = item.metadata || {};
            const isActiveDocument = item.status === 'queued' || item.status === 'processing' || item.status === 'anomaly';

            if (isActiveDocument) {
                return {
                    ...item,
                    metadata: lightMetadata,
                    createdAt: item.createdAt.toISOString(),
                    updatedAt: item.updatedAt.toISOString(),
                    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
                    status: item.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
                    ledgerEntries: params.includeLedgerEntries ? (entriesByDocId.get(item.id) || []) : undefined,
                };
            } else {
                const { imageUrls, ...itemWithoutImages } = item;
                return {
                    ...itemWithoutImages,
                    metadata: lightMetadata,
                    hasImages: (imageUrls?.length || 0) > 0,
                    createdAt: item.createdAt.toISOString(),
                    updatedAt: item.updatedAt.toISOString(),
                    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
                    status: item.status as "queued" | "processing" | "completed" | "anomaly" | undefined,
                    ledgerEntries: params.includeLedgerEntries ? (entriesByDocId.get(item.id) || []) : undefined,
                };
            }
        }),
        nextCursor,
    };
}

export async function batchDeleteSourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[]): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    if (sourceDocumentIds.length === 0) return;

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
}

export async function batchRetrySourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[]): Promise<void> {
    const { ledger, error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);

    // 1. Fetch all docs to get their current text/images
    const docs = await db.query.sourceDocuments.findMany({
        where: and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        )
    });

    // 2. Update status to queued and clear anomaly fields
    await db.update(sourceDocuments)
        .set({ status: "queued", anomalyReason: null })
        .where(and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        ));

    // 3. Retrigger tasks for each
    await Promise.all(docs.map(async (doc) => {
        const images = doc.imageUrls?.map(url => ({ data: url, mimeType: "image/jpeg" })) || [];
        await prepareSourceDocumentTask(ledgerId, ledger, doc.text || undefined, images, doc.id);
    }));
}

export interface SourceDocumentGroup {
    sourceDocument: Omit<SourceDocument, 'createdAt' | 'updatedAt' | 'deletedAt' | 'status'> & {
        createdAt: string;
        updatedAt: string;
        deletedAt?: string | null;
        status: "queued" | "processing" | "completed" | "anomaly" | undefined;
        ledgerEntries?: SourceDocumentGroup['ledgerEntries'];
    };
    ledgerEntries: (Omit<LedgerEntry, 'amount' | 'createdAt' | 'updatedAt' | 'entryDate' | 'deletedAt'> & {
        amount: string;
        createdAt: string;
        updatedAt: string;
        entryDate: string | null;
        deletedAt?: string | null;
    })[];
}

export interface GroupedSourceDocuments {
    queued: SourceDocumentGroup[];
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
            queued: [],
            processing: [],
            anomaly: [],
            completed: [],
        };

        activeDocsResult.items.forEach((doc) => {
            const group: SourceDocumentGroup = {
                sourceDocument: doc as unknown as SourceDocumentGroup['sourceDocument'],
                ledgerEntries: (doc.ledgerEntries || []) as unknown as SourceDocumentGroup['ledgerEntries'],
            };
            if (doc.status === 'anomaly') {
                groups.anomaly.push(group);
            } else if (doc.status === 'queued') {
                groups.queued.push(group);
            } else {
                groups.processing.push(group);
            }
        });

        completedDocsResult.items.forEach((doc) => {
            groups.completed.push({
                sourceDocument: doc as unknown as SourceDocumentGroup['sourceDocument'],
                ledgerEntries: (doc.ledgerEntries || []) as unknown as SourceDocumentGroup['ledgerEntries'],
            });
        });

        return {
            groups,
            nextCursor: completedDocsResult.nextCursor,
            stats: {
                queuedCount: groups.queued.length,
                processingCount: groups.processing.length,
                anomalyCount: groups.anomaly.length,
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get unified source documents");
        throw new Error(safeError(error));
    }
}

export async function batchUpdateSourceDocumentsAction(ledgerId: string, sourceDocumentIds: string[], data: { status?: string, title?: string }): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);

    await db.update(sourceDocuments)
        .set(data as Partial<SourceDocument>)
        .where(and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        ));
}

/**
 * Get all pending source documents (processing + anomaly) without date filtering.
 * Used for the pending bills modal that should always show ALL pending items.
 */
export async function getPendingSourceDocumentsAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    try {
        // Fetch active documents (queued, processing, anomaly) WITHOUT date filtering
        const activeDocsResult = await getSourceDocumentsAction(ledgerId, {
            status: 'queued,processing,anomaly',
            includeLedgerEntries: true,
            // No date filters - show ALL pending items
        });

        const groups = {
            queued: [] as SourceDocumentGroup[],
            processing: [] as SourceDocumentGroup[],
            anomaly: [] as SourceDocumentGroup[],
        };

        activeDocsResult.items.forEach((doc) => {
            const group: SourceDocumentGroup = {
                sourceDocument: doc as unknown as SourceDocumentGroup['sourceDocument'],
                ledgerEntries: (doc.ledgerEntries || []) as unknown as SourceDocumentGroup['ledgerEntries'],
            };
            if (doc.status === 'anomaly') {
                groups.anomaly.push(group);
            } else if (doc.status === 'queued') {
                groups.queued.push(group);
            } else {
                groups.processing.push(group);
            }
        });

        return {
            groups,
            stats: {
                queuedCount: groups.queued.length,
                processingCount: groups.processing.length,
                anomalyCount: groups.anomaly.length,
                total: groups.queued.length + groups.processing.length + groups.anomaly.length,
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get pending source documents");
        throw new Error(safeError(error));
    }
}

/**
 * Get a single source document with full data (including imageUrls).
 * Used for edit-retry when the list view has stripped imageUrls.
 */
export async function getSourceDocumentFullAction(ledgerId: string, sourceDocumentId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(sourceDocuments, ledgerId);

    const doc = await db.query.sourceDocuments.findFirst({
        where: q.whereId(sourceDocumentId),
    });

    if (!doc) {
        return null;
    }

    return {
        id: doc.id,
        text: doc.text,
        imageUrls: doc.imageUrls,
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
    };
}


"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeStart, parseDateRangeEnd, formatDateTimeForApi } from "@/lib/date-utils";
import { format } from "date-fns";
import { desc, lte, gte, inArray, and, eq, isNull, or, lt } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";
import { logger } from "@/lib/logger";
import type { SourceDocumentStatusType } from "@/features/source-document/server/schema";
import {
    type SerializedSourceDocument,
    type SerializedLedgerEntry,
    serializeLedgerEntry,
} from "@/lib/serialization";
import type {
    SourceDocumentWithEntries,
    PendingSourceDocumentsResponse,
} from "./types";
import {
    groupPendingSourceDocuments,
    calculateSourceDocumentStats,
    calculatePendingTotal,
    type SourceDocumentGroup,
} from "@/features/source-document/lib/grouping";

interface GetSourceDocumentsParams {
    status?: string | null;
    limit?: number;
    cursor?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    includeLedgerEntries?: boolean;
}

/**
 * Get paginated source documents with cursor-based pagination
 */
export async function getSourceDocumentsAction(
    ledgerId: string,
    params: GetSourceDocumentsParams
) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    const { status, limit = 20, startDate, endDate } = params;
    const q = forLedger(sourceDocuments, ledgerId);

    // Build conditions
    const conditions = [q.whereActive];

    if (status) {
        const statuses = status.split(",").filter(Boolean);
        if (statuses.length > 0) {
            conditions.push(inArray(sourceDocuments.status, statuses as SourceDocumentStatusType[]));
        }
    }

    if (startDate) {
        const parsedStart = parseDateRangeStart(startDate);
        if (parsedStart) conditions.push(gte(sourceDocuments.entryDate, format(parsedStart, 'yyyy-MM-dd')));
    }
    if (endDate) {
        const parsedEnd = parseDateRangeEnd(endDate);
        if (parsedEnd) conditions.push(lte(sourceDocuments.entryDate, format(parsedEnd, 'yyyy-MM-dd')));
    }

    // Handle cursor with precise composite condition
    if (params.cursor) {
        const parts = params.cursor.split('|');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            const [cursorDate, cursorCreated, cursorId] = parts;
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

    const items = await db.query.sourceDocuments.findMany({
        where: and(...conditions),
        orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        limit: limit + 1,
    });

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
                existing.push(serializeLedgerEntry({ ...entry, sourceDocument: null }));
                entriesByDocId.set(docId, existing);
            }
        });
    }

    return {
        items: resultItems.map(item => {
            const { aiRawResponse: _aiRawResponse, rawOcrText: _rawOcrText, visionDescription: _visionDescription, ...lightMetadata } = item.metadata || {};
            const isActiveDocument = item.status === 'queued' || item.status === 'processing' || item.status === 'anomaly' || item.status === 'failed';

            if (isActiveDocument) {
                return {
                    ...item,
                    metadata: lightMetadata,
                    createdAt: item.createdAt.toISOString(),
                    updatedAt: item.updatedAt.toISOString(),
                    deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
                    status: item.status as SourceDocumentStatusType | undefined,
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
                    status: item.status as SourceDocumentStatusType | undefined,
                    ledgerEntries: params.includeLedgerEntries ? (entriesByDocId.get(item.id) || []) : undefined,
                };
            }
        }),
        nextCursor,
    };
}

/**
 * Get all source documents as a flat array (not grouped).
 * Used for the new optimistic update architecture.
 */
export async function getAllSourceDocumentsAction(
    ledgerId: string,
    params: {
        startDate?: string | null;
        endDate?: string | null;
    } = {}
): Promise<SourceDocumentWithEntries[]> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

    try {
        const { startDate, endDate } = params;
        const q = forLedger(sourceDocuments, ledgerId);

        const conditions = [q.whereActive];

        if (startDate) {
            const parsedStart = parseDateRangeStart(startDate);
            if (parsedStart) conditions.push(gte(sourceDocuments.entryDate, format(parsedStart, 'yyyy-MM-dd')));
        }
        if (endDate) {
            const parsedEnd = parseDateRangeEnd(endDate);
            if (parsedEnd) conditions.push(lte(sourceDocuments.entryDate, format(parsedEnd, 'yyyy-MM-dd')));
        }

        const items = await db.query.sourceDocuments.findMany({
            where: and(...conditions),
            orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        });

        const docIds = items.map(d => d.id);
        type LedgerEntryWithCategory = typeof ledgerEntries.$inferSelect & {
            category: typeof entryCategories.$inferSelect | null;
        };
        const entriesByDocId = new Map<string, LedgerEntryWithCategory[]>();

        if (docIds.length > 0) {
            const qEntries = forLedger(ledgerEntries, ledgerId);
            const entries = await db.query.ledgerEntries.findMany({
                where: and(
                    qEntries.whereActive,
                    inArray(ledgerEntries.sourceDocumentId, docIds)
                ),
                with: { category: true }
            });

            entries.forEach(entry => {
                const list = entriesByDocId.get(entry.sourceDocumentId) || [];
                list.push(entry as LedgerEntryWithCategory);
                entriesByDocId.set(entry.sourceDocumentId, list);
            });
        }

        return items.map(doc => {
            const rawEntries = entriesByDocId.get(doc.id) || [];
            const serializedEntries = rawEntries.map(entry => {
                const serializedCategory = entry.category
                    ? {
                        id: entry.category.id,
                        name: entry.category.name,
                        createdAt: entry.category.createdAt.toISOString(),
                        updatedAt: entry.category.updatedAt.toISOString(),
                        deletedAt: entry.category.deletedAt ? entry.category.deletedAt.toISOString() : null,
                        ledgerId: entry.category.ledgerId,
                        description: entry.category.description,
                        icon: entry.category.icon,
                        sortOrder: entry.category.sortOrder,
                        isEditable: entry.category.isEditable,
                    }
                    : null;

                return {
                    id: entry.id,
                    createdAt: entry.createdAt.toISOString(),
                    updatedAt: entry.updatedAt.toISOString(),
                    deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
                    ledgerId: entry.ledgerId,
                    description: entry.description,
                    categoryId: entry.categoryId,
                    sourceDocumentId: entry.sourceDocumentId,
                    amount: String(entry.amount),
                    currency: entry.currency,
                    itemName: entry.itemName,
                    convertedAmount: entry.convertedAmount,
                    exchangeRate: entry.exchangeRate,
                    category: serializedCategory,
                };
            });

            return {
                ...doc,
                createdAt: doc.createdAt.toISOString(),
                updatedAt: doc.updatedAt.toISOString(),
                deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
                ledgerEntries: serializedEntries,
            };
        }) as SourceDocumentWithEntries[];
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get all source documents");
        throw new Error(safeError(error));
    }
}

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending bills modal that should always show ALL pending items.
 */
export async function getPendingSourceDocumentsAction(
    ledgerId: string
): Promise<PendingSourceDocumentsResponse> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    try {
        const activeDocsResult = await getSourceDocumentsAction(ledgerId, {
            status: 'queued,processing,anomaly,failed',
            includeLedgerEntries: true,
        });

        // Map items to include proper types for grouping
        const typedItems = activeDocsResult.items.map((doc) => ({
            ...(doc as SerializedSourceDocument),
            ledgerEntries: (doc.ledgerEntries || []) as SerializedLedgerEntry[],
        }));

        const groups = groupPendingSourceDocuments(typedItems);
        const stats = calculateSourceDocumentStats(groups);

        return {
            groups,
            stats: {
                ...stats,
                total: calculatePendingTotal(groups),
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
export async function getSourceDocumentFullAction(
    ledgerId: string,
    sourceDocumentId: string
) {
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

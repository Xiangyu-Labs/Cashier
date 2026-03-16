"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeStart, parseDateRangeEnd } from "@/lib/date-utils";
import { format } from "date-fns";
import { desc, lte, gte, inArray, and, eq, or, lt, sql, type SQL } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { SourceDocumentStatusType } from "@/features/source-document/server/schema";
import {
    type SerializedSourceDocument,
    type SerializedLedgerEntry,
    serializeLedgerEntry,
    serializeSourceDocument,
} from "@/lib/serialization";
import type {
    SourceDocumentWithEntries,
    PendingSourceDocumentsResponse,
    PaginatedSourceDocumentsResponse,
} from "./types";
import {
    groupPendingSourceDocuments,
    calculateSourceDocumentStats,
    calculatePendingTotal,
} from "@/features/source-document/lib/grouping";

interface GetSourceDocumentsParams {
    status?: string | null;
    limit?: number;
    cursor?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    includeLedgerEntries?: boolean;
}

// ============ Query Condition Builders ============

/**
 * Build status filter condition
 */
function buildStatusCondition(status: string | null | undefined): SQL<unknown> | null {
    if (!status) return null;

    const statuses = status.split(",").filter(Boolean);
    if (statuses.length === 0) return null;

    return inArray(sourceDocuments.status, statuses as SourceDocumentStatusType[]);
}

/**
 * Build date range conditions
 */
function buildDateConditions(
    startDate: string | null | undefined,
    endDate: string | null | undefined
): SQL<unknown>[] {
    const conditions: SQL<unknown>[] = [];

    if (startDate) {
        const parsedStart = parseDateRangeStart(startDate);
        if (parsedStart) conditions.push(gte(sourceDocuments.entryDate, format(parsedStart, 'yyyy-MM-dd')));
    }
    if (endDate) {
        const parsedEnd = parseDateRangeEnd(endDate);
        if (parsedEnd) conditions.push(lte(sourceDocuments.entryDate, format(parsedEnd, 'yyyy-MM-dd')));
    }

    return conditions;
}

/**
 * Build cursor pagination condition
 */
function buildCursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
    if (!cursor) return null;

    const parts = cursor.split('|');

    // Composite cursor: date|created|id
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const [cursorDate, cursorCreated, cursorId] = parts;
        return or(
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
        )!;
    }

    // Simple cursor: created|id
    if (parts.length === 2 && parts[0] && parts[1]) {
        const [cursorCreated, cursorId] = parts;
        return or(
            lt(sourceDocuments.createdAt, new Date(cursorCreated)),
            and(
                eq(sourceDocuments.createdAt, new Date(cursorCreated)),
                lt(sourceDocuments.id, cursorId)
            )
        )!;
    }

    return null;
}

/**
 * Generate next cursor from last item
 */
function generateNextCursor(lastItem: typeof sourceDocuments.$inferSelect): string {
    const nextDate = lastItem.entryDate || '0000-00-00';
    return `${nextDate}|${lastItem.createdAt.toISOString()}|${lastItem.id}`;
}

// ============ Ledger Entries Fetching ============

/**
 * Fetch ledger entries grouped by source document ID
 */
async function fetchEntriesByDocumentId(
    docIds: string[],
    ledgerId: string
): Promise<Map<string, SerializedLedgerEntry[]>> {
    const entriesByDocId = new Map<string, SerializedLedgerEntry[]>();

    if (docIds.length === 0) return entriesByDocId;

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

    return entriesByDocId;
}

// ============ Serialization Helpers ============

/**
 * Helper to serialize a source document based on its status
 * Uses unified serialization with appropriate options
 */
function serializeSourceDocumentByStatus(
    item: typeof sourceDocuments.$inferSelect,
    includeEntries: boolean,
    entriesByDocId: Map<string, SerializedLedgerEntry[]>
): SerializedSourceDocument {
    const entries = includeEntries ? (entriesByDocId.get(item.id) || []) : undefined;
    const isActiveDocument = item.status === 'queued' || item.status === 'processing' || item.status === 'anomaly' || item.status === 'failed';

    // Use unified serialization with appropriate options
    return serializeSourceDocument(item, {
        stripMetadataFields: ['visionDescription'],
        imageUrlsOverride: isActiveDocument ? undefined : [], // Strip for completed docs
        includeHasImages: !isActiveDocument,
        ledgerEntries: entries,
    });
}

// ============ getAllSourceDocumentsAction Helpers ============

/**
 * Fetch entries with categories grouped by document ID
 */
async function fetchEntriesWithCategories(
    docIds: string[],
    ledgerId: string
): Promise<Map<string, SerializedLedgerEntry[]>> {
    const entriesByDocId = new Map<string, SerializedLedgerEntry[]>();

    if (docIds.length === 0) return entriesByDocId;

    const qEntries = forLedger(ledgerEntries, ledgerId);
    const entries = await db.query.ledgerEntries.findMany({
        where: and(
            qEntries.whereActive,
            inArray(ledgerEntries.sourceDocumentId, docIds)
        ),
        with: { category: true }
    });

    entries.forEach(entry => {
        if (!entry.sourceDocumentId) return;
        const list = entriesByDocId.get(entry.sourceDocumentId) || [];
        list.push(serializeLedgerEntry({
            ...entry,
            category: entry.category,
        }));
        entriesByDocId.set(entry.sourceDocumentId, list);
    });

    return entriesByDocId;
}

/**
 * Serialize source document with entries for flat array response (LIST VIEW)
 * Excludes large fields like 'text' to keep payload small
 */
function serializeSourceDocumentFlat(
    doc: typeof sourceDocuments.$inferSelect,
    entries: SerializedLedgerEntry[]
): SourceDocumentWithEntries {
    // Use light serialization - exclude 'text' field for list views
    // 'text' can be very large (OCR results) and is not needed for list display
    return {
        id: doc.id,
        ledgerId: doc.ledgerId,
        title: doc.title,
        text: null, // Exclude large text content for list views
        imageUrls: [], // Exclude image URLs for list views
        status: doc.status,
        type: doc.type,
        anomalyReason: doc.anomalyReason,
        entryDate: doc.entryDate,
        metadata: {}, // Exclude metadata for list views
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
        ledgerEntries: entries,
        hasImages: (doc.imageUrls?.length || 0) > 0,
    } as SourceDocumentWithEntries;
}

/**
 * Get paginated source documents with cursor-based pagination
 */
export const getSourceDocumentsAction = withLedgerAccess(async (
    ledgerId: string,
    params: GetSourceDocumentsParams
) => {
    const { status, limit = 20, startDate, endDate, cursor, includeLedgerEntries } = params;
    const q = forLedger(sourceDocuments, ledgerId);

    // Build conditions
    const conditions = [
        q.whereActive,
        buildStatusCondition(status),
        ...buildDateConditions(startDate, endDate),
        buildCursorCondition(cursor),
    ].filter((c): c is SQL<unknown> => c !== null);

    const items = await db.query.sourceDocuments.findMany({
        where: and(...conditions),
        orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        limit: limit + 1,
    });

    let nextCursor: string | null = null;
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    if (hasMore) {
        nextCursor = generateNextCursor(items[limit]);
    }

    // Fetch ledger entries if requested
    const entriesByDocId = includeLedgerEntries && resultItems.length > 0
        ? await fetchEntriesByDocumentId(resultItems.map(d => d.id), ledgerId)
        : new Map<string, SerializedLedgerEntry[]>();

    return {
        items: resultItems.map(item => serializeSourceDocumentByStatus(item, !!includeLedgerEntries, entriesByDocId)),
        nextCursor,
    };
});

// Pagination constants
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_LIMIT = 1000;

/**
 * Get all source documents as a flat array (not grouped) with proper pagination.
 * Used for the new optimistic update architecture.
 *
 * Note: For backward compatibility, when called without pagination params, it uses
 * a default limit of 1000 documents. For larger datasets, use explicit pagination
 * or cursor-based pagination via getSourceDocumentsAction.
 */
export const getAllSourceDocumentsAction = withLedgerAccess(async (
    ledgerId: string,
    params: {
        startDate?: string | null;
        endDate?: string | null;
        page?: number;
        pageSize?: number;
    } = {}
): Promise<PaginatedSourceDocumentsResponse> => {
    try {
        const { startDate, endDate } = params;

        // Calculate pagination parameters
        const page = Math.max(1, params.page || 1);
        const pageSize = params.page
            ? Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE))
            : DEFAULT_PAGE_LIMIT;
        const offset = (page - 1) * pageSize;

        const q = forLedger(sourceDocuments, ledgerId);

        const conditions = [
            q.whereActive,
            ...buildDateConditions(startDate, endDate),
        ].filter((c): c is SQL<unknown> => c !== null);

        // Get total count for pagination info
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(sourceDocuments)
            .where(and(...conditions));
        const total = Number(countResult[0]?.count) || 0;

        // Query with limit + 1 to detect hasMore when using explicit pagination
        const queryLimit = params.page ? pageSize + 1 : pageSize;

        const items = await db.query.sourceDocuments.findMany({
            where: and(...conditions),
            orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
            limit: queryLimit,
            offset: params.page ? offset : 0,
        });

        // Warn when hitting the default limit without explicit pagination
        if (!params.page && items.length === DEFAULT_PAGE_LIMIT) {
            logger.warn(
                { ledgerId, limit: DEFAULT_PAGE_LIMIT, startDate, endDate },
                "getAllSourceDocumentsAction hit result limit - consider using cursor pagination"
            );
        }

        const hasMore = params.page ? items.length > pageSize : false;
        const resultItems = hasMore ? items.slice(0, pageSize) : items;

        const docIds = resultItems.map(d => d.id);
        const entriesByDocId = await fetchEntriesWithCategories(docIds, ledgerId);

        const result = resultItems.map(doc => serializeSourceDocumentFlat(doc, entriesByDocId.get(doc.id) || []));

        return { items: result, hasMore, total };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get all source documents");
        throw new AppError(safeError(error), "QUERY_ERROR", 500);
    }
});

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending source documents modal that should always show ALL pending items.
 */
export const getPendingSourceDocumentsAction = withLedgerAccess(async (
    ledgerId: string
): Promise<PendingSourceDocumentsResponse> => {
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
        throw new AppError(safeError(error), "QUERY_ERROR", 500);
    }
});

/**
 * Get a single source document with full data (including imageUrls).
 * Used for edit-retry when the list view has stripped imageUrls.
 */
export const getSourceDocumentFullAction = withLedgerAccess(async (
    ledgerId: string,
    sourceDocumentId: string
) => {
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
});

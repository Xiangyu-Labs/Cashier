"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";
import { parseDateRangeStart, parseDateRangeEnd } from "@/lib/date-utils";
import { format } from "date-fns";
import { desc, lte, gte, inArray, and, eq, or, lt, type SQL } from "drizzle-orm";
import { safeError } from "@/lib/safe-error";
import { logger } from "@/lib/logger";
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
        stripMetadataFields: ['aiRawResponse', 'rawOcrText', 'visionDescription'],
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
export async function getSourceDocumentsAction(
    ledgerId: string,
    params: GetSourceDocumentsParams
) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

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

        const conditions = [
            q.whereActive,
            ...buildDateConditions(startDate, endDate),
        ].filter((c): c is SQL<unknown> => c !== null);

        const items = await db.query.sourceDocuments.findMany({
            where: and(...conditions),
            orderBy: [desc(sourceDocuments.entryDate), desc(sourceDocuments.createdAt), desc(sourceDocuments.id)],
        });

        const docIds = items.map(d => d.id);
        const entriesByDocId = await fetchEntriesWithCategories(docIds, ledgerId);

        const result = items.map(doc => serializeSourceDocumentFlat(doc, entriesByDocId.get(doc.id) || []));

        return result;
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to get all source documents");
        throw new Error(safeError(error));
    }
}

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending source documents modal that should always show ALL pending items.
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

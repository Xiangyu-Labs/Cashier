"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers, sourceDocuments } from "@/lib/db/schema";
// auth is unused here

// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, inArray, and, gte, lte, or, lt, isNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";

const createLedgerEntrySchema = z.object({
    amount: z.number(),
    currency: z.string().optional(),
    itemName: z.string().min(1),
    categoryId: z.string().optional(),
    description: z.string().optional().nullable(),
    sourceDocumentId: z.string(),
});

const updateLedgerEntrySchema = z.object({
    categoryId: z.string().nullable().optional(),
    amount: z.number().optional(),
    currency: z.string().nullable().optional(),
    itemName: z.string().optional(),
    description: z.string().nullable().optional(),
});

import { forLedger } from "@/lib/db/scoped-query";
// Date string comparison - no need for date parsing utilities

export async function createLedgerEntryAction(ledgerId: string, data: z.infer<typeof createLedgerEntrySchema>): Promise<import("@/lib/db/schema").LedgerEntry> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = createLedgerEntrySchema.parse(data);
    const _q = forLedger(ledgerEntries, ledgerId);

    // Get ledger's main currency and source document's entryDate
    const ledger = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });
    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
    const entryCurrency = validated.currency || "CNY";

    // Get entryDate from source document for currency conversion
    const sourceDoc = await db.query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, validated.sourceDocumentId),
    });
    const entryDate = sourceDoc?.entryDate || undefined;

    // Calculate converted amount
    let convertedAmount: string | null = null;
    let exchangeRate: string | null = null;

    if (entryCurrency === mainCurrency) {
        convertedAmount = validated.amount.toFixed(2);
        exchangeRate = "1";
    } else {
        try {
            const converted = await ExchangeRateService.convert(
                validated.amount,
                entryCurrency,
                mainCurrency,
                entryDate
            );
            convertedAmount = converted.toFixed(2);
            // Calculate rate: converted / original
            exchangeRate = (converted / validated.amount).toFixed(6);
        } catch (err) {
            logger.warn({ err, entryCurrency, mainCurrency }, "Failed to convert amount, storing without conversion");
        }
    }

    const [entry] = await db.insert(ledgerEntries).values({
        amount: validated.amount.toFixed(2),
        ledgerId: ledgerId,
        sourceDocumentId: validated.sourceDocumentId,
        itemName: validated.itemName,
        currency: entryCurrency,
        categoryId: validated.categoryId,
        description: validated.description,
        convertedAmount,
        exchangeRate,
    }).returning();

    return entry;
}

export async function updateLedgerEntryAction(ledgerId: string, ledgerEntryId: string, data: z.infer<typeof updateLedgerEntrySchema>) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = updateLedgerEntrySchema.parse(data);
    const _q = forLedger(ledgerEntries, ledgerId);

    const updateData: Record<string, unknown> = {};
    if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
    if (validated.amount !== undefined) updateData.amount = validated.amount.toFixed(2);
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.itemName !== undefined) updateData.itemName = validated.itemName;
    if (validated.description !== undefined) updateData.description = validated.description;
    updateData.updatedAt = new Date();

    // If amount or currency changed, recalculate convertedAmount
    if (validated.amount !== undefined || validated.currency !== undefined) {
        // Get current entry and ledger for calculation
        // Include ledgerId in query to prevent IDOR
        const [currentEntry, ledger] = await Promise.all([
            db.query.ledgerEntries.findFirst({
                where: and(
                    eq(ledgerEntries.id, ledgerEntryId),
                    eq(ledgerEntries.ledgerId, ledgerId),
                    isNull(ledgerEntries.deletedAt)
                ),
                with: { sourceDocument: true },
            }),
            db.query.ledgers.findFirst({
                where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
            })
        ]);

        if (currentEntry) {
            const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
            const newAmount = validated.amount ?? Number(currentEntry.amount);
            const newCurrency = validated.currency ?? currentEntry.currency ?? "CNY";
            // Get entryDate from source document
            const entryDate = currentEntry.sourceDocument?.entryDate || undefined;

            if (newCurrency === mainCurrency) {
                updateData.convertedAmount = newAmount.toFixed(2);
                updateData.exchangeRate = "1";
            } else {
                try {
                    const converted = await ExchangeRateService.convert(
                        newAmount,
                        newCurrency,
                        mainCurrency,
                        entryDate
                    );
                    updateData.convertedAmount = converted.toFixed(2);
                    updateData.exchangeRate = (converted / newAmount).toFixed(6);
                } catch (err) {
                    logger.warn({ err, newCurrency, mainCurrency }, "Failed to convert amount during update");
                }
            }
        }
    }

    const [updatedEntry] = await db.update(ledgerEntries)
        .set(updateData)
        .where(_q.whereId(ledgerEntryId))
        .returning();

    if (!updatedEntry) throw new Error("Entry not found or access denied");

    return {
        ...updatedEntry,
        amount: updatedEntry.amount,
        createdAt: updatedEntry.createdAt.toISOString(),
    };
}

export async function deleteLedgerEntryAction(ledgerId: string, ledgerEntryId: string): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(ledgerEntries, ledgerId);
    await db.update(ledgerEntries)
        .set(q.softDelete)
        .where(q.whereId(ledgerEntryId));
}

export async function batchDeleteLedgerEntriesAction(ledgerId: string, ledgerEntryIds: string[]): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(ledgerEntries, ledgerId);

    await db.update(ledgerEntries)
        .set(q.softDelete)
        .where(and(
            q.whereActive,
            inArray(ledgerEntries.id, ledgerEntryIds)
        ));
}

export async function batchUpdateLedgerEntriesAction(ledgerId: string, ledgerEntryIds: string[], data: Record<string, unknown>): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const updateData: Record<string, unknown> = {};
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.itemName !== undefined) updateData.itemName = data.itemName;
    updateData.updatedAt = new Date();

    const q = forLedger(ledgerEntries, ledgerId);

    await db.update(ledgerEntries)
        .set(updateData)
        .where(and(
            q.whereActive,
            inArray(ledgerEntries.id, ledgerEntryIds)
        ));
}

export async function getLedgerEntriesAction(
    ledgerId: string,
    params: {
        limit?: number;
        cursor?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }
) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    const q = forLedger(ledgerEntries, ledgerId);
    const limit = params.limit ?? 20;

    // Build conditions
    const conditions = [q.whereActive];
    // Date filtering now uses sourceDocument.entryDate via subquery
    if (params.startDate) {
        conditions.push(
            sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date >= ${params.startDate} AND deleted_at IS NULL
            )`
        );
    }
    if (params.endDate) {
        conditions.push(
            sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date <= ${params.endDate} AND deleted_at IS NULL
            )`
        );
    }
    if (params.categoryId) conditions.push(eq(ledgerEntries.categoryId, params.categoryId));
    if (params.currency) conditions.push(eq(ledgerEntries.currency, params.currency));
    // Filter by convertedAmount (main currency) for price range filtering
    // Use CAST to compare as numbers, not strings
    if (params.minAmount !== undefined && params.minAmount !== null) {
        conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${params.minAmount}`);
    }
    if (params.maxAmount !== undefined && params.maxAmount !== null) {
        conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) <= ${params.maxAmount}`);
    }

    // Handle cursor with precise composite condition
    // Cursor format: "createdAt|id" (simplified since entryDate is now on sourceDocument)
    // Order: (createdAt DESC, id DESC)
    if (params.cursor) {
        const parts = params.cursor.split('|');
        if (parts.length === 2 && parts[0] && parts[1]) {
            const [cursorCreated, cursorId] = parts;
            conditions.push(
                or(
                    lt(ledgerEntries.createdAt, new Date(cursorCreated)),
                    and(
                        eq(ledgerEntries.createdAt, new Date(cursorCreated)),
                        lt(ledgerEntries.id, cursorId)
                    )
                )!
            );
        }
    }

    // Single query with precise conditions
    const items = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        orderBy: (entries, { desc }) => [desc(entries.createdAt), desc(entries.id)],
        limit: limit + 1,
        with: {
            category: true,
            sourceDocument: true,
        }
    });

    // Determine next cursor
    let nextCursor: string | undefined = undefined;
    let resultItems = items;

    if (items.length > limit) {
        const nextItem = items[limit];
        nextCursor = `${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        resultItems = items.slice(0, limit);
    }

    // Map dates to strings
    const mappedItems = resultItems.map(item => ({
        ...item,
        amount: String(item.amount),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
        category: item.category ? {
            ...item.category,
            createdAt: item.category.createdAt.toISOString(),
            updatedAt: item.category.updatedAt.toISOString(),
            deletedAt: item.category.deletedAt ? item.category.deletedAt.toISOString() : null,
        } : null,
        sourceDocument: item.sourceDocument ? (() => {
            const { aiRawResponse, rawOcrText, ...lightMetadata } = item.sourceDocument.metadata || {};
             
            const { imageUrls, ...docWithoutImages } = item.sourceDocument;
            return {
                ...docWithoutImages,
                metadata: lightMetadata,
                hasImages: (imageUrls?.length || 0) > 0,
                createdAt: item.sourceDocument.createdAt.toISOString(),
                updatedAt: item.sourceDocument.updatedAt.toISOString(),
                deletedAt: item.sourceDocument.deletedAt ? item.sourceDocument.deletedAt.toISOString() : null,
            };
        })() : null,
    }));

    return {
        items: mappedItems,
        nextCursor
    };
}

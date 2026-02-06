"use server";

import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
// auth is unused here

// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, inArray, and, gte, lte } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

const createLedgerEntrySchema = z.object({
    amount: z.number(),
    currency: z.string().optional(),
    itemName: z.string().min(1),
    categoryId: z.string().optional(),
    entryDate: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    sourceDocumentId: z.string().optional().nullable(),
});

const updateLedgerEntrySchema = z.object({
    categoryId: z.string().nullable().optional(),
    amount: z.number().optional(),
    currency: z.string().nullable().optional(),
    itemName: z.string().optional(),
    description: z.string().nullable().optional(),
    entryDate: z.string().nullable().optional(),
});

import { forLedger } from "@/lib/db/scoped-query";
// Date string comparison - no need for date parsing utilities

export async function createLedgerEntryAction(ledgerId: string, data: z.infer<typeof createLedgerEntrySchema>): Promise<import("@/lib/db/schema").LedgerEntry> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = createLedgerEntrySchema.parse(data);
    const _q = forLedger(ledgerEntries, ledgerId);

    const [entry] = await db.insert(ledgerEntries).values({
        ...validated,
        amount: validated.amount.toFixed(2),
        ledgerId: ledgerId,
        currency: validated.currency || "CNY",
        entryDate: validated.entryDate || null,
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
    if (validated.entryDate !== undefined) updateData.entryDate = validated.entryDate || null;

    const [updatedEntry] = await db.update(ledgerEntries)
        .set(updateData)
        .where(_q.whereId(ledgerEntryId))
        .returning();

    if (!updatedEntry) throw new Error("Entry not found or access denied");

    return {
        ...updatedEntry,
        amount: updatedEntry.amount,
        createdAt: updatedEntry.createdAt.toISOString(),
        entryDate: updatedEntry.entryDate,
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
    if (data.entryDate !== undefined) updateData.entryDate = data.entryDate ? (data.entryDate as string).split('T')[0] : null;

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
    }
) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) {
        throw new Error("Unauthorized");
    }

    const q = forLedger(ledgerEntries, ledgerId);
    const limit = params.limit ?? 20;

    // Build base conditions (without cursor)
    const baseConditions = [q.whereActive];
    if (params.startDate) baseConditions.push(gte(ledgerEntries.entryDate, params.startDate));
    if (params.endDate) baseConditions.push(lte(ledgerEntries.entryDate, params.endDate));
    if (params.categoryId) baseConditions.push(eq(ledgerEntries.categoryId, params.categoryId));

    // Parse initial cursor
    let cursorDate: string | null = null;
    let cursorCreatedVal: number | null = null;
    let cursorId: string | null = null;

    if (params.cursor) {
        const parts = params.cursor.split('|');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            cursorDate = parts[0];
            cursorCreatedVal = new Date(parts[1]).getTime();
            cursorId = parts[2];
        }
    }

    // Helper function to filter items based on cursor (strict less-than comparison)
    const filterByCursor = (items: typeof allItems, cDate: string, cCreatedVal: number, cId: string) => {
        return items.filter(item => {
            const itemDate = item.entryDate || '';
            const itemCreatedVal = item.createdAt.getTime();

            if (itemDate < cDate) return true;
            if (itemDate > cDate) return false;

            if (itemCreatedVal < cCreatedVal) return true;
            if (itemCreatedVal > cCreatedVal) return false;

            return item.id < cId;
        });
    };

    // Collect items using loop to ensure we get enough data
    type ItemWithRelations = Awaited<ReturnType<typeof db.query.ledgerEntries.findMany>>[number];
    let allItems: ItemWithRelations[] = [];
    let internalCursorDate = cursorDate;
    const MAX_ITERATIONS = 10;
    let iterations = 0;
    let hasMoreData = true;

    while (allItems.length <= limit && hasMoreData && iterations < MAX_ITERATIONS) {
        iterations++;

        // Build query conditions for this iteration
        const queryConditions = [...baseConditions];
        if (internalCursorDate) {
            queryConditions.push(lte(ledgerEntries.entryDate, internalCursorDate));
        }

        // Fetch batch
        const batchSize = limit + 1 + (iterations > 1 ? limit : 0); // Fetch more on subsequent iterations
        const batch = await db.query.ledgerEntries.findMany({
            where: and(...queryConditions),
            orderBy: (entries, { desc }) => [desc(entries.entryDate), desc(entries.createdAt), desc(entries.id)],
            limit: batchSize,
            with: {
                category: true,
                sourceDocument: true,
            }
        });

        if (batch.length === 0) {
            hasMoreData = false;
            break;
        }

        // Filter by cursor if we have one (for the first iteration or if cursor spans multiple fetches)
        let filteredBatch = batch;
        if (cursorDate && cursorCreatedVal !== null && cursorId) {
            filteredBatch = filterByCursor(batch, cursorDate, cursorCreatedVal, cursorId);
        }

        // Add new items (avoid duplicates by checking ids)
        const existingIds = new Set(allItems.map(item => item.id));
        for (const item of filteredBatch) {
            if (!existingIds.has(item.id)) {
                allItems.push(item);
                existingIds.add(item.id);
            }
        }

        // Check if we got less than requested (no more data in DB)
        if (batch.length < batchSize) {
            hasMoreData = false;
            break;
        }

        // Update internal cursor for next iteration
        const lastItem = batch[batch.length - 1];
        const lastDate = lastItem.entryDate || '';

        // If last item's date is same as internal cursor, we might be stuck
        // Move to the next date range
        if (internalCursorDate && lastDate === internalCursorDate) {
            // We need to go further back - decrease the date
            // This shouldn't happen often if we fetch enough items
            internalCursorDate = lastDate;
        } else {
            internalCursorDate = lastDate;
        }
    }

    // Determine next cursor
    let nextCursor: string | undefined = undefined;
    let resultItems = allItems;

    if (allItems.length > limit) {
        const nextItem = allItems[limit];
        const nextDate = nextItem.entryDate || '0000-00-00';
        nextCursor = `${nextDate}|${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        resultItems = allItems.slice(0, limit);
    }

    // Map dates to strings
    const mappedItems = resultItems.map(item => ({
        ...item,
        amount: String(item.amount),
        createdAt: item.createdAt.toISOString(),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
        entryDate: item.entryDate,
        category: item.category ? {
            ...item.category,
            createdAt: item.category.createdAt.toISOString(),
            updatedAt: item.category.updatedAt.toISOString(),
            deletedAt: item.category.deletedAt ? item.category.deletedAt.toISOString() : null,
        } : null,
        sourceDocument: item.sourceDocument ? (() => {
            const { aiRawResponse, rawOcrText, ...lightMetadata } = item.sourceDocument.metadata || {};
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { imageUrls, ...docWithoutImages } = item.sourceDocument;
            return {
                ...docWithoutImages,
                metadata: lightMetadata,
                hasImages: (imageUrls?.length || 0) > 0,
                createdAt: item.sourceDocument.createdAt.toISOString(),
                deletedAt: item.sourceDocument.deletedAt ? item.sourceDocument.deletedAt.toISOString() : null,
            };
        })() : null,
    }));

    return {
        items: mappedItems,
        nextCursor
    };
}

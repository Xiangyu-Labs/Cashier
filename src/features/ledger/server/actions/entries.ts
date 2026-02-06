"use server";

import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
// auth is unused here

// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, inArray, and, gte, lte, or, lt } from "drizzle-orm";
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
    updateData.updatedAt = new Date();

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
    if (params.startDate) conditions.push(gte(ledgerEntries.entryDate, params.startDate));
    if (params.endDate) conditions.push(lte(ledgerEntries.entryDate, params.endDate));
    if (params.categoryId) conditions.push(eq(ledgerEntries.categoryId, params.categoryId));

    // Handle cursor with precise composite condition
    // Cursor format: "entryDate|createdAt|id"
    // Order: (entryDate DESC, createdAt DESC, id DESC)
    // Condition: (entryDate, createdAt, id) < (cursorDate, cursorCreated, cursorId)
    if (params.cursor) {
        const parts = params.cursor.split('|');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            const [cursorDate, cursorCreated, cursorId] = parts;
            // Use precise composite condition with SQL template
            // This is equivalent to: (entryDate, createdAt, id) < (cursorDate, cursorCreated, cursorId)
            conditions.push(
                or(
                    lt(ledgerEntries.entryDate, cursorDate),
                    and(
                        eq(ledgerEntries.entryDate, cursorDate),
                        lt(ledgerEntries.createdAt, new Date(cursorCreated))
                    ),
                    and(
                        eq(ledgerEntries.entryDate, cursorDate),
                        eq(ledgerEntries.createdAt, new Date(cursorCreated)),
                        lt(ledgerEntries.id, cursorId)
                    )
                )!
            );
        }
    }

    // Single query with precise conditions - no manual filtering needed!
    const items = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        orderBy: (entries, { desc }) => [desc(entries.entryDate), desc(entries.createdAt), desc(entries.id)],
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
        const nextDate = nextItem.entryDate || '0000-00-00';
        nextCursor = `${nextDate}|${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        resultItems = items.slice(0, limit);
    }

    // Map dates to strings
    const mappedItems = resultItems.map(item => ({
        ...item,
        amount: String(item.amount),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
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

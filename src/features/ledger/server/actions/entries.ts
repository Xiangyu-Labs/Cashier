"use server";

import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray, and, gte, lte, desc, isNull } from "drizzle-orm";
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

export async function createLedgerEntryAction(ledgerId: string, data: z.infer<typeof createLedgerEntrySchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = createLedgerEntrySchema.parse(data);

        // Cast to any to avoid "unknown property" error if Repo type doesn't include currency yet
        const entry = await scope.entries.create({
            ...validated,
            amount: validated.amount.toString(),
            ledgerId: ledgerId,
            currency: validated.currency || "CNY",
            // entryDate handled by scope? or need validation?
            entryDate: validated.entryDate ? new Date(validated.entryDate) : undefined,
        } as any);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, data: entry };
    } catch (error) {
        logger.error({ error, ledgerId }, "Failed to create ledger entry via action");
        return { success: false, error: "Failed to create ledger entry" };
    }
}

export async function updateLedgerEntryAction(ledgerId: string, ledgerEntryId: string, data: z.infer<typeof updateLedgerEntrySchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = updateLedgerEntrySchema.parse(data);

        // Filter out undefined values
        const updateData: any = {};
        if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
        if (validated.amount !== undefined) updateData.amount = validated.amount.toString();
        if (validated.currency !== undefined) updateData.currency = validated.currency;
        if (validated.itemName !== undefined) updateData.itemName = validated.itemName;
        if (validated.description !== undefined) updateData.description = validated.description;
        if (validated.entryDate !== undefined) updateData.entryDate = validated.entryDate ? new Date(validated.entryDate) : null;

        const updatedEntry = await scope.entries.update(ledgerEntryId, updateData);

        revalidatePath(`/ledger/${ledgerId}`);

        // Map back to API type
        return {
            success: true,
            data: {
                ...updatedEntry,
                amount: updatedEntry.amount,
                createdAt: updatedEntry.createdAt.toISOString(),
                entryDate: updatedEntry.entryDate ? updatedEntry.entryDate.toISOString() : null,
            }
        };
    } catch (error) {
        logger.error({ error, ledgerId, ledgerEntryId }, "Failed to update ledger entry via action");
        return { success: false, error: "Failed to update ledger entry" };
    }
}

export async function deleteLedgerEntryAction(ledgerId: string, ledgerEntryId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        await scope.entries.delete(ledgerEntryId);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, ledgerEntryId }, "Failed to delete ledger entry via action");
        return { success: false, error: "Failed to delete ledger entry" };
    }
}

export async function batchDeleteLedgerEntriesAction(ledgerId: string, ledgerEntryIds: string[]) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        await scope.entries.batchDelete(ledgerEntryIds);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, ledgerEntryIds }, "Failed to batch delete ledger entries");
        return { success: false, error: "Failed to batch delete" };
    }
}

export async function batchUpdateLedgerEntriesAction(ledgerId: string, ledgerEntryIds: string[], data: any) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const updateData: any = {};
        if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
        if (data.currency !== undefined) updateData.currency = data.currency;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.itemName !== undefined) updateData.itemName = data.itemName;
        if (data.entryDate !== undefined) updateData.entryDate = data.entryDate ? new Date(data.entryDate) : null;

        await scope.entries.batchUpdate(ledgerEntryIds, updateData);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ error, ledgerId, ledgerEntryIds }, "Failed to batch update ledger entries");
        return { success: false, error: "Failed to batch update" };
    }
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
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) {
        throw new Error("Unauthorized");
    }

    const limit = params.limit ?? 20;
    const conditions = [
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt)
    ];

    if (params.startDate) conditions.push(gte(ledgerEntries.entryDate, new Date(params.startDate)));
    if (params.endDate) conditions.push(lte(ledgerEntries.entryDate, new Date(params.endDate)));
    if (params.categoryId) conditions.push(eq(ledgerEntries.categoryId, params.categoryId));

    // Handle cursor for pagination: (entryDate, createdAt, id)
    if (params.cursor) {
        const [cursorDate, cursorCreated, cursorId] = params.cursor.split('|');
        if (cursorDate && cursorCreated && cursorId) {
            // This is a bit complex in Drizzle if we want strict (entryDate, createdAt, id) < (cursorDate, cursorCreated, cursorId)
            // For simplicity and correctness in most cases, we'll use a slightly safer approach or raw SQL if needed.
            // But let's stick to a robust enough version:
            conditions.push(lte(ledgerEntries.entryDate, new Date(cursorDate)));
            // Note: Strict tie-breaking is harder with findMany where clause. 
            // We'll filter the results manually if needed or just use the cursor as is if it's unique enough.
            // Let's refine the query to be more precise if possible.
        } else {
            // Fallback to old behavior if cursor format is wrong
            conditions.push(lte(ledgerEntries.createdAt, new Date(params.cursor)));
        }
    }

    const items = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        orderBy: (entries, { desc }) => [desc(entries.entryDate), desc(entries.createdAt), desc(entries.id)],
        limit: limit + 1,
        with: {
            category: true,
            sourceDocument: true,
        }
    });

    // Manual tie-breaking filtering if cursor was provided
    let filteredItems = items;
    if (params.cursor) {
        const [cursorDate, cursorCreated, cursorId] = params.cursor.split('|');
        if (cursorDate && cursorId) {
            const cursorDateVal = new Date(cursorDate).getTime();
            const cursorCreatedVal = new Date(cursorCreated).getTime();
            filteredItems = items.filter(item => {
                const itemDateVal = item.entryDate ? item.entryDate.getTime() : 0;
                const itemCreatedVal = item.createdAt.getTime();

                if (itemDateVal < cursorDateVal) return true;
                if (itemDateVal > cursorDateVal) return false;

                if (itemCreatedVal < cursorCreatedVal) return true;
                if (itemCreatedVal > cursorCreatedVal) return false;

                return item.id < cursorId;
            });
        }
    }

    let nextCursor: string | undefined = undefined;
    if (filteredItems.length > limit) {
        const nextItem = filteredItems[limit];
        const nextDate = nextItem.entryDate ? nextItem.entryDate.toISOString() : new Date(0).toISOString();
        nextCursor = `${nextDate}|${nextItem.createdAt.toISOString()}|${nextItem.id}`;
        filteredItems = filteredItems.slice(0, limit);
    }

    // Map dates to strings
    const mappedItems = filteredItems.map(item => ({
        ...item,
        amount: String(item.amount), // Ensure string to match LedgerEntry interface
        createdAt: item.createdAt.toISOString(),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
        entryDate: item.entryDate ? item.entryDate.toISOString() : null,
        // Map relations if they exist (they should with query builder)
        category: item.category ? {
            ...item.category,
            createdAt: item.category.createdAt.toISOString(),
            updatedAt: item.category.updatedAt.toISOString(),
            deletedAt: item.category.deletedAt ? item.category.deletedAt.toISOString() : null,
        } : null,
        sourceDocument: item.sourceDocument ? {
            ...item.sourceDocument,
            createdAt: item.sourceDocument.createdAt.toISOString(),
            deletedAt: item.sourceDocument.deletedAt ? item.sourceDocument.deletedAt.toISOString() : null,
            // Map text/title etc. ImageUrls is json, auto-parsed? Drizzle JSONB is usually parsed.
            // Check TS types if needed.
        } : null,
    }));

    return {
        items: mappedItems,
        nextCursor
    };
}

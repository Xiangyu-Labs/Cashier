"use server";

import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray, and, gte, lte, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/lib/auth/helpers";

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
    const conditions = [eq(ledgerEntries.ledgerId, ledgerId)];

    if (params.startDate) conditions.push(gte(ledgerEntries.entryDate, new Date(params.startDate)));
    if (params.endDate) conditions.push(lte(ledgerEntries.entryDate, new Date(params.endDate)));
    if (params.cursor) conditions.push(lte(ledgerEntries.createdAt, new Date(params.cursor)));
    if (params.categoryId) conditions.push(eq(ledgerEntries.categoryId, params.categoryId));

    const items = await db.query.ledgerEntries.findMany({
        where: and(...conditions),
        orderBy: (entries, { desc }) => [desc(entries.entryDate), desc(entries.createdAt)],
        limit: limit + 1,
        with: {
            category: true,
            sourceDocument: true,
        }
    });

    let nextCursor: string | undefined = undefined;
    if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.createdAt.toISOString();
    }

    // Map dates to strings
    const mappedItems = items.map(item => ({
        ...item,
        amount: String(item.amount), // Ensure string to match LedgerEntry interface
        createdAt: item.createdAt.toISOString(),
        entryDate: item.entryDate ? item.entryDate.toISOString() : null,
        // Map relations if they exist (they should with query builder)
        category: item.category ? {
            ...item.category,
            createdAt: item.category.createdAt.toISOString(),
            updatedAt: item.category.updatedAt.toISOString(),
        } : null,
        sourceDocument: item.sourceDocument ? {
            ...item.sourceDocument,
            createdAt: item.sourceDocument.createdAt.toISOString(),
            // Map text/title etc. ImageUrls is json, auto-parsed? Drizzle JSONB is usually parsed.
            // Check TS types if needed.
        } : null,
    }));

    return {
        items: mappedItems,
        nextCursor
    };
}

"use server";

import { db } from "@/lib/db";
import { ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { clearUserDefaultLedger } from "@/features/auth/server/services/user-setup";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Soft delete a ledger and all its related data (entries, categories, source documents)
 */
export const deleteLedgerAction = withAuth(async (userId: string, ledgerId: string): Promise<void> => {
    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });

    if (!existing) {
        throw new NotFoundError("Ledger");
    }

    if (existing.userId !== userId) {
        throw new ForbiddenError("Access denied to this ledger");
    }

    const qEntries = forLedger(ledgerEntries, ledgerId);
    const qCategories = forLedger(entryCategories, ledgerId);
    const qSourceDocs = forLedger(sourceDocuments, ledgerId);

    // Soft delete all related data in a transaction
    await db.transaction(async (tx) => {
        // 1. Soft delete all ledger entries
        await tx
            .update(ledgerEntries)
            .set(qEntries.softDelete)
            .where(qEntries.whereActive);

        // 2. Soft delete all entry categories
        await tx
            .update(entryCategories)
            .set(qCategories.softDelete)
            .where(qCategories.whereActive);

        // 3. Soft delete all source documents
        await tx
            .update(sourceDocuments)
            .set(qSourceDocs.softDelete)
            .where(qSourceDocs.whereActive);

        // 4. Soft delete the ledger itself
        await tx
            .update(ledgers)
            .set({ deletedAt: new Date() })
            .where(eq(ledgers.id, ledgerId));
    });

    // Clear defaultLedgerId for users who had this ledger as default
    await clearUserDefaultLedger(ledgerId);

    // Invalidate cache
    updateTag('ledger');
});

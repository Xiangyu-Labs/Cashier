"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";
import { and, inArray } from "drizzle-orm";

/**
 * Update source document metadata (e.g. title, entryDate)
 */
export async function updateSourceDocumentAction(
    ledgerId: string,
    sourceId: string,
    data: { title?: string; entryDate?: string }
): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(sourceDocuments, ledgerId);

    await db.update(sourceDocuments)
        .set({ ...data, updatedAt: new Date() })
        .where(q.whereId(sourceId));
}

/**
 * Batch update multiple source documents
 */
export async function batchUpdateSourceDocumentsAction(
    ledgerId: string,
    sourceDocumentIds: string[],
    data: { status?: string; title?: string; entryDate?: string }
): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    if (sourceDocumentIds.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);

    await db.update(sourceDocuments)
        .set(data as Partial<typeof sourceDocuments.$inferSelect>)
        .where(and(
            q.whereActive,
            inArray(sourceDocuments.id, sourceDocumentIds)
        ));
}

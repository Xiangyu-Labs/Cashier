"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

/**
 * Fetch a source document by its global ID.
 * Verifies access to the associated ledger.
 */
export async function getSourceDocumentByIdAction(id: string) {
    try {
        const doc = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, id),
            with: {
                ledgerEntries: {
                    where: (entries, { isNull }) => isNull(entries.deletedAt),
                    with: { category: true }
                }
            }
        });

        if (!doc) {
            return { success: false, error: "Document not found or has been deleted." };
        }

        // Verify access to the ledger this document belongs to
        const { error } = await requireLedgerAccess(doc.ledgerId);
        if (error) return { success: false, error };

        return {
            success: true,
            data: {
                ...doc,
                createdAt: doc.createdAt.toISOString(),
                deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
                status: doc.status as "queued" | "processing" | "completed" | "anomaly",
                ledgerEntries: doc.ledgerEntries.map(entry => ({
                    ...entry,
                    amount: String(entry.amount),
                    createdAt: entry.createdAt.toISOString(),
                    deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
                    entryDate: entry.entryDate
                }))
            }
        };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
    }
}

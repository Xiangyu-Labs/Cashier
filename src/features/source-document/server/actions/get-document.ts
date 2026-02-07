"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

/**
 * Fetch a source document by its global ID.
 * Verifies access to the associated ledger.
 * Returns null for both "not found" and "not authorized" to avoid information leakage.
 */
export async function getSourceDocumentByIdAction(id: string) {
    // First, get just the ledgerId to check access (minimal data exposure)
    const docMeta = await db.query.sourceDocuments.findFirst({
        where: and(
            eq(sourceDocuments.id, id),
            isNull(sourceDocuments.deletedAt)
        ),
        columns: { ledgerId: true }
    });

    if (!docMeta) {
        return null;
    }

    // Verify access before fetching full document
    const { error } = await requireLedgerAccess(docMeta.ledgerId);
    if (error) {
        // Return null instead of throwing to avoid leaking document existence
        return null;
    }

    // Now fetch full document with relations
    const doc = await db.query.sourceDocuments.findFirst({
        where: and(
            eq(sourceDocuments.id, id),
            isNull(sourceDocuments.deletedAt)
        ),
        with: {
            ledgerEntries: {
                where: (entries, { isNull }) => isNull(entries.deletedAt),
                with: { category: true }
            }
        }
    });

    if (!doc) {
        return null;
    }

    return {
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
    };
}


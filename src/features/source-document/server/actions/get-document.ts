"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import type { SourceDocument, LedgerEntry } from "@/types/api";

// Return type for getSourceDocumentByIdAction - uses standardized API types
export type SourceDocumentWithEntries = SourceDocument & {
    ledgerEntries: LedgerEntry[];
};

/**
 * Fetch a source document by its global ID.
 * Verifies access to the associated ledger.
 * Returns null for both "not found" and "not authorized" to avoid information leakage.
 */
export async function getSourceDocumentByIdAction(id: string): Promise<SourceDocumentWithEntries | null> {
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

    // Serialize dates to strings for JSON compatibility
    // The return type SourceDocumentWithEntries expects serialized dates
    return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
        ledgerEntries: doc.ledgerEntries.map(entry => ({
            ...entry,
            amount: String(entry.amount),
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
            deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
        })) as unknown as LedgerEntry[],
    } as unknown as SourceDocumentWithEntries;
}


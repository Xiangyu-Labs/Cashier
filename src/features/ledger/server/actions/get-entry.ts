"use server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

export async function getLedgerEntryAction(id: string): Promise<import("@/types/api").LedgerEntry | null> {
    const entry = await db.query.ledgerEntries.findFirst({
        where: eq(ledgerEntries.id, id),
        with: {
            category: true,
            sourceDocument: true,
        }
    });

    if (!entry) {
        return null;
    }

    // Verify access to the ledger this entry belongs to
    // We do this AFTER fetching because we need the ledgerId
    const { error } = await requireLedgerAccess(entry.ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger entry denied");

    // Strip large metadata fields from sourceDocument to reduce payload size
    let cleanedSourceDocument = null;
    if (entry.sourceDocument) {
        const { aiRawResponse, rawOcrText, ...lightMetadata } = entry.sourceDocument.metadata || {};
        // Strip imageUrls (Base64 encoded images)
         
        const { imageUrls, ...docWithoutImages } = entry.sourceDocument;
        cleanedSourceDocument = {
            ...docWithoutImages,
            metadata: lightMetadata,
            hasImages: (imageUrls?.length || 0) > 0,
            createdAt: entry.sourceDocument.createdAt.toISOString(),
            updatedAt: entry.sourceDocument.updatedAt.toISOString(),
            deletedAt: entry.sourceDocument.deletedAt ? entry.sourceDocument.deletedAt.toISOString() : null,
        };
    }

    return {
        ...entry,
        amount: String(entry.amount),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
        category: entry.category ? {
            ...entry.category,
            createdAt: entry.category.createdAt.toISOString(),
            updatedAt: entry.category.updatedAt.toISOString(),
            deletedAt: entry.category.deletedAt ? entry.category.deletedAt.toISOString() : null,
        } : null,
        sourceDocument: cleanedSourceDocument,
    };
}


"use server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { serializeLedgerEntry, serializeSourceDocument, type SerializedLedgerEntry } from "@/lib/serialization";

export async function getLedgerEntryAction(id: string): Promise<SerializedLedgerEntry | null> {
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

    // Use unified serialization
    const serializedEntry = serializeLedgerEntry({
        ...entry,
        category: entry.category,
        sourceDocument: entry.sourceDocument
            ? {
                id: entry.sourceDocument.id,
                title: entry.sourceDocument.title,
            }
            : undefined,
    });

    // Strip large metadata fields from sourceDocument to reduce payload size
    if (serializedEntry.sourceDocument) {
        const { aiRawResponse: _aiRawResponse, rawOcrText: _rawOcrText, visionDescription: _visionDescription, ...lightMetadata } = serializedEntry.sourceDocument.metadata || {};
        serializedEntry.sourceDocument = {
            ...serializedEntry.sourceDocument,
            metadata: lightMetadata,
            imageUrls: [], // Strip image URLs
            hasImages: (entry.sourceDocument.imageUrls?.length || 0) > 0,
        };
    }

    return serializedEntry;
}


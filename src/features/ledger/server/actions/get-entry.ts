"use server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

export async function getLedgerEntryAction(id: string) {
    try {
        const entry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, id),
            with: {
                category: true,
                sourceDocument: true,
            }
        });

        if (!entry) {
            return { success: false, error: "Link not found or has been deleted." };
        }

        // Verify access to the ledger this entry belongs to
        // We do this AFTER fetching because we need the ledgerId
        const { error } = await requireLedgerAccess(entry.ledgerId);
        if (error) return { success: false, error: "Unauthorized" };

        // Strip large metadata fields from sourceDocument to reduce payload size
        let cleanedSourceDocument = null;
        if (entry.sourceDocument) {
            const { aiRawResponse, rawOcrText, ...lightMetadata } = entry.sourceDocument.metadata || {};
            cleanedSourceDocument = {
                ...entry.sourceDocument,
                metadata: lightMetadata,
                createdAt: entry.sourceDocument.createdAt.toISOString(),
                deletedAt: entry.sourceDocument.deletedAt ? entry.sourceDocument.deletedAt.toISOString() : null,
            };
        }

        return {
            success: true,
            data: {
                ...entry,
                amount: String(entry.amount),
                createdAt: entry.createdAt.toISOString(),
                deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
                category: entry.category ? {
                    ...entry.category,
                    createdAt: entry.category.createdAt.toISOString(),
                    updatedAt: entry.category.updatedAt.toISOString(),
                    deletedAt: entry.category.deletedAt ? entry.category.deletedAt.toISOString() : null,
                } : null,
                sourceDocument: cleanedSourceDocument,
            }
        };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
}


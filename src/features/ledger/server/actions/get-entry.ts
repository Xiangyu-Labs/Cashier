"use server";

import { db } from "@/lib/db";
import { ledgerEntries, ledgers, entryCategories, sourceDocuments } from "@/lib/db/schema";
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
        if (error) return { success: false, error };

        return { success: true, data: entry };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { updateLedgerSchema, type UpdateLedgerInput } from "./schemas";
import { recalculateEntriesConvertedAmount } from "./helpers";
import { revalidateTag } from "next/cache";

export const updateLedgerAction = withAuth(async (userId: string, id: string, data: UpdateLedgerInput): Promise<import("@/types/api").Ledger> => {
    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== userId) {
        throw new Error("Ledger not found or access denied");
    }

    const validated = updateLedgerSchema.parse(data);

    const currentMetadata = existing.metadata || {};
    const currentSettings = currentMetadata.settings || {};
    const oldMainCurrency = currentSettings.mainCurrency || "CNY";
    const newMainCurrency = validated.settings?.mainCurrency;

    const newSettings = {
        ...currentSettings,
        ...(validated.settings || {}),
    };

    const [updatedLedger] = await db
        .update(ledgers)
        .set({
            name: validated.name || existing.name,
            metadata: {
                ...currentMetadata,
                settings: newSettings,
            }
        })
        .where(eq(ledgers.id, id))
        .returning();

    // Revalidate cache to ensure fresh data on next request
    revalidateTag('ledger');

    // If main currency changed, recalculate all entries' convertedAmount
    if (newMainCurrency && newMainCurrency !== oldMainCurrency) {
        logger.info({ ledgerId: id, oldMainCurrency, newMainCurrency }, "Main currency changed, recalculating entries");

        // Do this asynchronously to not block the response
        recalculateEntriesConvertedAmount(id, newMainCurrency).catch(err => {
            logger.error({ err, ledgerId: id }, "Failed to recalculate entries after currency change");
        });
    }

    // Serialize dates to strings to match the API type
    return {
        id: updatedLedger.id,
        userId: updatedLedger.userId,
        name: updatedLedger.name,
        metadata: updatedLedger.metadata,
        createdAt: updatedLedger.createdAt.toISOString(),
        updatedAt: updatedLedger.updatedAt.toISOString(),
        deletedAt: updatedLedger.deletedAt ? updatedLedger.deletedAt.toISOString() : null,
    };
});

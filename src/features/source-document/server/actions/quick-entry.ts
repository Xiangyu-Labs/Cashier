"use server";

import { db } from "@/lib/db";
import { sourceDocuments, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { and, eq, isNull } from "drizzle-orm";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";
import { logger } from "@/lib/logger";
import { SourceDocumentType } from "@/features/source-document/server/schema";
import { createQuickEntrySchema } from "./types";
import type { z } from "zod";

/**
 * Create a quick entry (manual entry without AI parsing).
 * Atomically creates a SourceDocument (type="manual", status="completed") and a LedgerEntry.
 */
export async function createQuickEntryAction(
    ledgerId: string,
    data: z.infer<typeof createQuickEntrySchema>
) {
    const { ledger, error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized or Ledger not found");

    const validated = createQuickEntrySchema.parse(data);
    const mainCurrency = ledger.metadata?.settings?.mainCurrency || "CNY";
    const entryCurrency = validated.currency || mainCurrency;
    const today = validated.entryDate || formatDateTimeForApi(new Date());

    // Look up category for title generation
    const category = await db.query.entryCategories.findFirst({
        where: and(
            eq(entryCategories.id, validated.categoryId),
            isNull(entryCategories.deletedAt)
        ),
    });
    const categoryName = category?.name || "";
    const itemName = validated.itemName || categoryName;
    const title = categoryName;

    // Exchange rate conversion
    let convertedAmount: string | null = null;
    let exchangeRate: string | null = null;

    if (entryCurrency === mainCurrency) {
        convertedAmount = validated.amount.toFixed(2);
        exchangeRate = "1";
    } else {
        try {
            const converted = await ExchangeRateService.convert(
                validated.amount, entryCurrency, mainCurrency, today
            );
            convertedAmount = converted.toFixed(2);
            exchangeRate = (converted / validated.amount).toFixed(6);
        } catch (err) {
            logger.warn({ err }, "Quick entry: failed to convert amount");
        }
    }

    const sourceDocId = crypto.randomUUID();
    const entryId = crypto.randomUUID();

    // Atomic insert: sourceDocument + ledgerEntry
    db.transaction((tx) => {
        tx.insert(sourceDocuments).values({
            id: sourceDocId,
            ledgerId,
            title,
            text: null,
            imageUrls: [],
            status: "completed",
            type: SourceDocumentType.Manual,
            entryDate: today,
        }).run();

        tx.insert(ledgerEntries).values({
            id: entryId,
            ledgerId,
            sourceDocumentId: sourceDocId,
            categoryId: validated.categoryId,
            amount: validated.amount.toFixed(2),
            currency: entryCurrency,
            itemName,
            description: validated.description || null,
            convertedAmount,
            exchangeRate,
        }).run();
    });

    return {
        sourceDocumentId: sourceDocId,
        ledgerEntryId: entryId,
        status: "completed" as const,
    };
}

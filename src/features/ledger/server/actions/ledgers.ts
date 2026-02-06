"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories, ledgerEntries } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { auth } from "@/auth";
// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";

const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

const updateLedgerSchema = z.object({
    name: z.string().optional(),
    settings: z.object({
        aiLanguage: z.string().optional(),
        currencies: z.array(z.string()).optional(),
        mainCurrency: z.string().optional(),
        collapseProcessingDefault: z.boolean().optional(),
        collapseBillsDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
    }).optional(),
});

export async function createLedgerAction(data: z.infer<typeof createLedgerSchema>): Promise<import("@/lib/db/schema").Ledger> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please log in to create a ledger");
    }

    const validated = createLedgerSchema.parse(data);

    // Create ledger
    const [newLedger] = await db
        .insert(ledgers)
        .values({
            userId: session.user.id,
            name: validated.name,
            metadata: {
                settings: {
                    aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                    currencies: defaultLedger.settings.currencies,
                    mainCurrency: defaultLedger.settings.mainCurrency,
                    collapseProcessingDefault: defaultLedger.settings.collapseProcessingDefault,
                    collapseBillsDefault: defaultLedger.settings.collapseBillsDefault,
                    aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                }
            }
        })
        .returning();

    // Seed categories for the new ledger
    if (defaultLedger.categories.length > 0) {
        await db.insert(entryCategories).values(
            defaultLedger.categories.map((cat) => ({
                ...cat,
                ledgerId: newLedger.id,
            }))
        );
    }

    return newLedger;
}

export async function updateLedgerAction(id: string, data: z.infer<typeof updateLedgerSchema>): Promise<import("@/lib/db/schema").Ledger> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please log in to update a ledger");
    }

    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== session.user.id) {
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

    // If main currency changed, recalculate all entries' convertedAmount
    if (newMainCurrency && newMainCurrency !== oldMainCurrency) {
        logger.info({ ledgerId: id, oldMainCurrency, newMainCurrency }, "Main currency changed, recalculating entries");

        // Do this asynchronously to not block the response
        recalculateEntriesConvertedAmount(id, newMainCurrency).catch(err => {
            logger.error({ err, ledgerId: id }, "Failed to recalculate entries after currency change");
        });
    }

    return updatedLedger;
}

// Helper function to recalculate all entries' convertedAmount for a ledger
async function recalculateEntriesConvertedAmount(ledgerId: string, mainCurrency: string) {
    const entries = await db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    });

    for (const entry of entries) {
        const entryCurrency = entry.currency || "CNY";
        const amount = Number(entry.amount);
        const entryDate = entry.entryDate || undefined;

        let convertedAmount: string;
        let exchangeRate: string;

        if (entryCurrency === mainCurrency) {
            convertedAmount = amount.toFixed(2);
            exchangeRate = "1";
        } else {
            try {
                const converted = await ExchangeRateService.convert(
                    amount,
                    entryCurrency,
                    mainCurrency,
                    entryDate
                );
                convertedAmount = converted.toFixed(2);
                exchangeRate = (converted / amount).toFixed(6);
            } catch (err) {
                logger.warn({ err, entryId: entry.id, entryCurrency, mainCurrency }, "Failed to convert entry during recalculation");
                continue; // Skip this entry
            }
        }

        await db.update(ledgerEntries)
            .set({ convertedAmount, exchangeRate, updatedAt: new Date() })
            .where(eq(ledgerEntries.id, entry.id));
    }

    logger.info({ ledgerId, totalEntries: entries.length }, "Finished recalculating entries");
}

export async function deleteLedgerAction(id: string): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please log in to delete a ledger");
    }

    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== session.user.id) {
        throw new Error("Ledger not found or access denied");
    }

    await db.update(ledgers)
        .set({ deletedAt: new Date() })
        .where(eq(ledgers.id, id));
}

export async function getLedgerAction(id: string): Promise<import("@/types/api").Ledger | null> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== session.user.id) {
        return null;
    }

    return {
        id: existing.id,
        userId: existing.userId,
        name: existing.name,
        metadata: existing.metadata,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
    };
}

export async function getLedgersAction(): Promise<import("@/types/api").Ledger[]> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, session.user.id), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(row => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    }));
}


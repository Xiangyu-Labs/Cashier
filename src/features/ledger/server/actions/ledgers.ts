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
import { taskVersionManager } from "@/lib/task-version";

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
    const taskKey = `recalculate:${ledgerId}`;
    const version = taskVersionManager.acquire(taskKey);

    const entries = await db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
        with: { sourceDocument: true },
    });

    if (entries.length === 0) {
        taskVersionManager.release(taskKey, version);
        return;
    }

    // Check if superseded before expensive batch conversion
    if (!taskVersionManager.isValid(taskKey, version)) {
        logger.info({ ledgerId, version }, "Recalculation superseded before batch conversion");
        return;
    }

    // Prepare items for batch conversion
    const conversionItems = entries.map(entry => ({
        amount: Number(entry.amount),
        from: entry.currency || "CNY",
        to: mainCurrency,
        date: entry.sourceDocument?.entryDate || undefined,
    }));

    // Batch convert all entries (optimized: M DB queries for M unique dates)
    let results: Array<{ convertedAmount: number; exchangeRate: number }>;
    try {
        results = await ExchangeRateService.convertBatch(conversionItems, mainCurrency);
    } catch (err) {
        logger.error({ err, ledgerId }, "Failed to batch convert entries");
        taskVersionManager.release(taskKey, version);
        return;
    }

    // Final check before committing updates
    if (!taskVersionManager.isValid(taskKey, version)) {
        logger.info({ ledgerId, version }, "Recalculation superseded before database update");
        return;
    }

    // Batch update using transaction
    db.transaction((tx) => {
        for (let i = 0; i < entries.length; i++) {
            // Check version periodically (every 100 entries) to allow early abort
            if (i % 100 === 0 && !taskVersionManager.isValid(taskKey, version)) {
                logger.info({ ledgerId, version, processedCount: i }, "Recalculation superseded during update");
                return;
            }

            tx.update(ledgerEntries)
                .set({
                    convertedAmount: results[i].convertedAmount.toFixed(2),
                    exchangeRate: results[i].exchangeRate.toFixed(6),
                    updatedAt: new Date(),
                })
                .where(eq(ledgerEntries.id, entries[i].id))
                .run();
        }
    });

    taskVersionManager.release(taskKey, version);
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

    const { sourceDocuments } = await import("@/lib/db/schema");
    const now = new Date();

    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
        // 1. Soft delete all associated ledger entries
        tx.update(ledgerEntries)
            .set({ deletedAt: now })
            .where(and(eq(ledgerEntries.ledgerId, id), isNull(ledgerEntries.deletedAt)))
            .run();

        // 2. Soft delete all associated entry categories
        tx.update(entryCategories)
            .set({ deletedAt: now })
            .where(and(eq(entryCategories.ledgerId, id), isNull(entryCategories.deletedAt)))
            .run();

        // 3. Soft delete all associated source documents
        tx.update(sourceDocuments)
            .set({ deletedAt: now })
            .where(and(eq(sourceDocuments.ledgerId, id), isNull(sourceDocuments.deletedAt)))
            .run();

        // 4. Finally soft delete the ledger itself
        tx.update(ledgers)
            .set({ deletedAt: now })
            .where(eq(ledgers.id, id))
            .run();
    });
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


"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories, ledgerEntries, serviceCredentials, users } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { auth } from "@/auth";
import { z } from "zod";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";
import { taskVersionManager } from "@/lib/task-version";
import { unstable_cache } from "next/cache";

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
        collapseEntriesDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
        showMonthlyExpense: z.boolean().optional(),
        monthStartDay: z.number().min(1).max(31).optional(),
    }).optional(),
});

export async function createLedgerAction(data: z.infer<typeof createLedgerSchema>): Promise<import("@/lib/db/schema").Ledger> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please log in to create a ledger");
    }

    const validated = createLedgerSchema.parse(data);

    let newLedger: import("@/lib/db/schema").Ledger;

    // Atomically create ledger and seed categories in a transaction
    db.transaction((tx) => {
        // 1. Create ledger
        [newLedger] = tx
            .insert(ledgers)
            .values({
                userId: session.user.id,
                name: validated.name,
                metadata: {
                    settings: {
                        aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                        currencies: defaultLedger.settings.currencies,
                        mainCurrency: defaultLedger.settings.mainCurrency,
                        collapseEntriesDefault: defaultLedger.settings.collapseEntriesDefault,
                        aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                    }
                }
            })
            .returning()
            .all();

        // 2. Seed categories for the new ledger
        if (defaultLedger.categories.length > 0) {
            tx.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            ).run();
        }
    });

    return newLedger!;
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

// Helper types for recalculation
interface ConversionItem {
    amount: number;
    from: string;
    to: string;
    date: string | undefined;
}

interface ConversionResult {
    convertedAmount: number;
    exchangeRate: number;
}

/**
 * Fetch entries with source documents for conversion
 */
async function fetchEntriesForConversion(ledgerId: string) {
    return db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
        with: { sourceDocument: true },
    });
}

/**
 * Build conversion items from entries
 */
function buildConversionItems(
    entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
    mainCurrency: string
): ConversionItem[] {
    return entries.map(entry => ({
        amount: Number(entry.amount),
        from: entry.currency || "CNY",
        to: mainCurrency,
        date: entry.sourceDocument?.entryDate || undefined,
    }));
}

/**
 * Batch convert all entries
 */
async function convertEntriesBatch(
    items: ConversionItem[],
    mainCurrency: string,
    ledgerId: string
): Promise<ConversionResult[] | null> {
    try {
        return await ExchangeRateService.convertBatch(items, mainCurrency);
    } catch (err) {
        logger.error({ err, ledgerId }, "Failed to batch convert entries");
        return null;
    }
}

/**
 * Build SQL CASE expression for batch update
 */
function buildCaseExpression(
    entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
    results: ConversionResult[],
    field: 'convertedAmount' | 'exchangeRate'
): SQL {
    const cases = entries.map((entry, i) => {
        const value = field === 'convertedAmount'
            ? results[i].convertedAmount.toFixed(2)
            : results[i].exchangeRate.toFixed(6);
        return sql`WHEN ${entry.id} THEN ${value}`;
    });

    return sql`CASE id ${sql.join(cases)} END`;
}

/**
 * Update entries with converted amounts in a single batch query
 */
function updateEntriesWithConversions(
    entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
    results: ConversionResult[],
    ledgerId: string,
    taskKey: string,
    version: number
): void {
    // Check if superseded before starting the transaction
    if (!taskVersionManager.isValid(taskKey, version)) {
        logger.info({ ledgerId, version }, "Recalculation superseded before batch update");
        throw new Error('SUPERSEDED');
    }

    const entryIds = entries.map(e => e.id);

    db.transaction((tx) => {
        // Single batch update using CASE expression
        tx.update(ledgerEntries)
            .set({
                convertedAmount: buildCaseExpression(entries, results, 'convertedAmount'),
                exchangeRate: buildCaseExpression(entries, results, 'exchangeRate'),
                updatedAt: new Date(),
            })
            .where(and(
                eq(ledgerEntries.ledgerId, ledgerId),
                inArray(ledgerEntries.id, entryIds)
            ))
            .run();
    });

    logger.info({ ledgerId, totalEntries: entries.length }, "Batch updated entries with new currency conversion");
}

/**
 * Helper function to recalculate all entries' convertedAmount for a ledger
 */
async function recalculateEntriesConvertedAmount(ledgerId: string, mainCurrency: string) {
    const taskKey = `recalculate:${ledgerId}`;
    const version = taskVersionManager.acquire(taskKey);

    const entries = await fetchEntriesForConversion(ledgerId);

    if (entries.length === 0) {
        taskVersionManager.release(taskKey, version);
        return;
    }

    // Check if superseded before expensive batch conversion
    if (!taskVersionManager.isValid(taskKey, version)) {
        logger.info({ ledgerId, version }, "Recalculation superseded before batch conversion");
        return;
    }

    const conversionItems = buildConversionItems(entries, mainCurrency);
    const results = await convertEntriesBatch(conversionItems, mainCurrency, ledgerId);

    if (!results) {
        taskVersionManager.release(taskKey, version);
        return;
    }

    // Final check before committing updates
    if (!taskVersionManager.isValid(taskKey, version)) {
        logger.info({ ledgerId, version }, "Recalculation superseded before database update");
        return;
    }

    // Batch update using transaction
    try {
        updateEntriesWithConversions(entries, results, ledgerId, taskKey, version);

        taskVersionManager.release(taskKey, version);
        logger.info({ ledgerId, totalEntries: entries.length }, "Finished recalculating entries");
    } catch (err) {
        if (err instanceof Error && err.message === 'SUPERSEDED') {
            logger.info({ ledgerId, version }, "Recalculation superseded, transaction rolled back");
            taskVersionManager.release(taskKey, version);
            return;
        }
        throw err;
    }
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

    // Check if this is the only ledger
    const allUserLedgers = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, session.user.id), isNull(ledgers.deletedAt)),
    });

    if (allUserLedgers.length <= 1) {
        throw new Error("Cannot delete the only ledger. You must have at least one ledger.");
    }

    // Check if this is the user's default ledger
    const user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
    });

    if (user?.defaultLedgerId === id) {
        throw new Error("Cannot delete the primary ledger. Please set another ledger as primary first.");
    }

    const { sourceDocuments, taskRuns } = await import("@/lib/db/schema");
    const { flowEngine } = await import("@/lib/flow");
    const { inArray } = await import("drizzle-orm");
    const now = new Date();

    // Find and cancel all task_runs for this ledger before transaction
    const relatedTaskRuns = await db.query.taskRuns.findMany({
        where: and(
            isNull(taskRuns.deletedAt),
            eq(taskRuns.scopeId, id)
        ),
    });

    // Cancel any running/pending tasks
    for (const task of relatedTaskRuns) {
        if (task.status === 'pending' || task.status === 'running') {
            await flowEngine.cancel(task.id);
        }
    }

    const taskIdsToDelete = relatedTaskRuns.map(t => t.id);

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

        // 4. Soft delete all associated task_runs
        if (taskIdsToDelete.length > 0) {
            tx.update(taskRuns)
                .set({ deletedAt: now })
                .where(inArray(taskRuns.id, taskIdsToDelete))
                .run();
        }

        // 5. Soft delete all associated service credentials
        tx.update(serviceCredentials)
            .set({ deletedAt: now })
            .where(and(eq(serviceCredentials.ledgerId, id), isNull(serviceCredentials.deletedAt)))
            .run();

        // 6. Finally soft delete the ledger itself
        tx.update(ledgers)
            .set({ deletedAt: now })
            .where(eq(ledgers.id, id))
            .run();
    });
}

// Cached version of getLedgerAction with cache tagging for revalidation
const cachedGetLedger = unstable_cache(
    async (ledgerId: string, userId: string): Promise<import("@/types/api").Ledger | null> => {
        const existing = await db.query.ledgers.findFirst({
            where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
        });

        if (!existing || existing.userId !== userId) {
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
    },
    ['ledger'],
    {
        revalidate: 60, // Cache for 60 seconds
        tags: ['ledger'],
    }
);

export async function getLedgerAction(id: string): Promise<import("@/types/api").Ledger | null> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    // Use versioned cache key to invalidate on app updates
    return cachedGetLedger(id, session.user.id);
}

// Cached version of getLedgersAction
const cachedGetLedgers = unstable_cache(
    async (userId: string): Promise<import("@/types/api").Ledger[]> => {
        const rows = await db.query.ledgers.findMany({
            where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
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
    },
    ['ledgers'],
    {
        revalidate: 60,
        tags: ['ledgers'],
    }
);

export async function getLedgersAction(): Promise<import("@/types/api").Ledger[]> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    return cachedGetLedgers(session.user.id);
}

export async function setDefaultLedgerAction(ledgerId: string): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized: Please log in to set default ledger");
    }

    const { setUserDefaultLedger } = await import("@/features/auth/server/services/user-setup");
    await setUserDefaultLedger(session.user.id, ledgerId);
}

export async function getDefaultLedgerIdAction(): Promise<string | null> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const { getUserDefaultLedgerId } = await import("@/features/auth/server/services/user-setup");
    return getUserDefaultLedgerId(session.user.id);
}


import { eq, and, isNull, sql, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { taskVersionManager } from "@/lib/task-version";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";

export interface ConversionItem {
    amount: number;
    from: string;
    to: string;
    date: string | undefined;
}

export interface ConversionResult {
    convertedAmount: number;
    exchangeRate: number;
}

/**
 * Fetch entries with source documents for conversion
 */
export async function fetchEntriesForConversion(ledgerId: string) {
    return db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
        with: { sourceDocument: true },
    });
}

/**
 * Build conversion items from entries
 */
export function buildConversionItems(
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
export async function convertEntriesBatch(
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
export function buildCaseExpression(
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
export function updateEntriesWithConversions(
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
export async function recalculateEntriesConvertedAmount(ledgerId: string, mainCurrency: string) {
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

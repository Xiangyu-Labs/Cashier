import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { initializeExchangeRateLedgerRecalculationOrchestration } from "@/lib/orchestration/exchange-rate-ledger-recalculation";
import { logger } from "@/lib/logger";
import { taskVersionManager } from "@/lib/task-version";
import {
  convertAmountsBatch,
  type CurrencyBatchConversionItem,
  type CurrencyBatchConversionResult,
} from "@/modules/currency/use-cases";
import { ledgerEntries } from "@/persistence";

initializeExchangeRateLedgerRecalculationOrchestration();

export async function fetchEntriesForConversion(ledgerId: string) {
  return db.query.ledgerEntries.findMany({
    where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
    with: { sourceDocument: true },
  });
}

export function buildConversionItems(
  entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
  mainCurrency: string
): CurrencyBatchConversionItem[] {
  return entries.map((entry) => ({
    amount: Number(entry.amount),
    fromCurrency: entry.currency ?? "CNY",
    toCurrency: mainCurrency,
    ...(entry.sourceDocument?.entryDate != null ? { date: entry.sourceDocument.entryDate } : {}),
  }));
}

export async function convertEntriesBatch(
  items: CurrencyBatchConversionItem[],
  mainCurrency: string,
  ledgerId: string
): Promise<CurrencyBatchConversionResult[] | null> {
  try {
    return await convertAmountsBatch(items, mainCurrency);
  } catch (err) {
    logger.error({ err, ledgerId }, "Failed to batch convert entries");
    return null;
  }
}

export function buildCaseExpression(
  entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
  results: CurrencyBatchConversionResult[],
  field: "convertedAmount" | "exchangeRate"
): SQL {
  const cases = entries.map((entry, index) => {
    const result = results[index];
    if (result == null) {
      throw new Error(`Missing conversion result for ledger entry ${entry.id} at index ${index}`);
    }

    const value =
      field === "convertedAmount"
        ? result.convertedAmount.toFixed(2)
        : result.exchangeRate.toFixed(6);
    return sql`WHEN ${entry.id} THEN ${value}`;
  });

  return sql`CASE id ${sql.join(cases)} END`;
}

export function updateEntriesWithConversions(
  entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
  results: CurrencyBatchConversionResult[],
  ledgerId: string,
  taskKey: string,
  version: number
): void {
  if (!taskVersionManager.isValid(taskKey, version)) {
    logger.info({ ledgerId, version }, "Recalculation superseded before batch update");
    throw new Error("SUPERSEDED");
  }

  const entryIds = entries.map((entry) => entry.id);

  db.transaction((tx) => {
    tx.update(ledgerEntries)
      .set({
        convertedAmount: buildCaseExpression(entries, results, "convertedAmount"),
        exchangeRate: buildCaseExpression(entries, results, "exchangeRate"),
        updatedAt: new Date(),
      })
      .where(and(eq(ledgerEntries.ledgerId, ledgerId), inArray(ledgerEntries.id, entryIds)))
      .run();
  });

  logger.info(
    { ledgerId, totalEntries: entries.length },
    "Batch updated entries with new currency conversion"
  );
}

export async function recalculateEntriesConvertedAmount(ledgerId: string, mainCurrency: string) {
  const taskKey = `recalculate:${ledgerId}`;
  const version = taskVersionManager.acquire(taskKey);

  const entries = await fetchEntriesForConversion(ledgerId);

  if (entries.length === 0) {
    taskVersionManager.release(taskKey, version);
    return;
  }

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

  if (!taskVersionManager.isValid(taskKey, version)) {
    logger.info({ ledgerId, version }, "Recalculation superseded before database update");
    return;
  }

  try {
    updateEntriesWithConversions(entries, results, ledgerId, taskKey, version);
    taskVersionManager.release(taskKey, version);
    logger.info({ ledgerId, totalEntries: entries.length }, "Finished recalculating entries");
  } catch (err) {
    if (err instanceof Error && err.message === "SUPERSEDED") {
      logger.info({ ledgerId, version }, "Recalculation superseded, transaction rolled back");
      taskVersionManager.release(taskKey, version);
      return;
    }
    throw err;
  }
}

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { registerExchangeRatesStoredHandler } from "@/modules/currency/events";
import type { ExchangeRatesStoredEvent } from "@/modules/currency/application/ports";
import { ledgerEntries, ledgers, sourceDocuments } from "@/persistence";
import { serverComposition } from "@/application/server-composition-root";

let orchestrationInitialized = false;

const MAX_CONCURRENT_RECALCULATIONS = 5;

export function initializeExchangeRateLedgerRecalculationOrchestration(): void {
  if (orchestrationInitialized) {
    return;
  }

  registerExchangeRatesStoredHandler(
    (event) =>
      onExchangeRatesStored(event).catch((err) => {
        logger.error(
          { err, rateDate: event.date },
          "Failed to trigger ledger recalculation after exchange rate update"
        );
      }),
    serverComposition.exchangeRates
  );

  orchestrationInitialized = true;
}

/**
 * Ledgers that currently have active or pending entries whose source document
 * entry date matches the stored rates date, or that have no entry date at all
 * (undated entries are recalculated with the latest stored rate). Soft-deleted
 * documents, entries, and ledgers are excluded.
 */
async function findLedgersNeedingRecalculation(date: string) {
  return db
    .selectDistinct({ id: ledgers.id, mainCurrency: ledgers.mainCurrency })
    .from(ledgers)
    .innerJoin(
      sourceDocuments,
      and(
        eq(sourceDocuments.ledgerId, ledgers.id),
        or(eq(sourceDocuments.entryDate, date), isNull(sourceDocuments.entryDate)),
        isNull(sourceDocuments.deletedAt)
      )
    )
    .innerJoin(
      ledgerEntries,
      and(
        eq(ledgerEntries.ledgerId, ledgers.id),
        eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
        isNull(ledgerEntries.deletedAt),
        or(
          eq(sourceDocuments.activeRevisionId, ledgerEntries.sourceDocumentRevisionId),
          eq(sourceDocuments.pendingRevisionId, ledgerEntries.sourceDocumentRevisionId)
        )
      )
    )
    .where(isNull(ledgers.deletedAt));
}

export async function onExchangeRatesStored(event: ExchangeRatesStoredEvent): Promise<void> {
  try {
    const { recalculateEntriesConvertedAmountForDate } =
      await import("@/modules/ledger/application/services/recalculate-entries-converted-amount");

    const ledgersWithEntries = await findLedgersNeedingRecalculation(event.date);

    let nextIndex = 0;
    const workerCount = Math.min(MAX_CONCURRENT_RECALCULATIONS, ledgersWithEntries.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < ledgersWithEntries.length) {
        const ledger = ledgersWithEntries[nextIndex]!;
        nextIndex += 1;
        try {
          await recalculateEntriesConvertedAmountForDate(
            ledger.id,
            ledger.mainCurrency,
            event.date,
            serverComposition.currencies
          );
        } catch (err) {
          logger.error(
            { err, ledgerId: ledger.id, rateDate: event.date },
            "Failed to recalculate ledger entries after exchange rate update"
          );
        }
      }
    });

    await Promise.all(workers);
  } catch (err) {
    logger.error({ err }, "Failed to trigger ledger recalculation after exchange rate update");
  }
}

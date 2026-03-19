import { isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { registerExchangeRatesStoredHandler } from "@/modules/currency/events";
import { ledgers } from "@/persistence";

let orchestrationInitialized = false;

export function initializeExchangeRateLedgerRecalculationOrchestration(): void {
  if (orchestrationInitialized) {
    return;
  }

  const unsubscribe = registerExchangeRatesStoredHandler(() => {
    onExchangeRatesStored().catch((err) => {
      logger.error({ err }, "Failed to trigger ledger recalculation after exchange rate update");
    });
  });

  if (unsubscribe == null) {
    return;
  }

  orchestrationInitialized = true;
}

export async function onExchangeRatesStored(): Promise<void> {
  try {
    const { recalculateEntriesConvertedAmount } = await import("@/modules/ledger/use-cases");

    const allLedgers = await db.query.ledgers.findMany({
      where: isNull(ledgers.deletedAt),
      columns: { id: true, metadata: true },
    });

    for (const ledger of allLedgers) {
      const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
      recalculateEntriesConvertedAmount(ledger.id, mainCurrency).catch((err) => {
        logger.error(
          { err, ledgerId: ledger.id },
          "Failed to recalculate after exchange rate update"
        );
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to trigger ledger recalculation after exchange rate update");
  }
}

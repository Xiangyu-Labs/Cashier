import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { logger } from "@/lib/logger";
import { isNull } from "drizzle-orm";
import { ExchangeRateService } from "../ExchangeRateService";

let orchestrationInitialized = false;

export function initializeExchangeRateRecalculationOrchestration(): void {
  if (orchestrationInitialized) {
    return;
  }

  if (typeof ExchangeRateService.registerRatesStoredHandler !== "function") {
    logger.warn(
      "ExchangeRateService mock does not expose registerRatesStoredHandler; skipping orchestration hook"
    );
    return;
  }

  orchestrationInitialized = true;
  ExchangeRateService.registerRatesStoredHandler(() => {
    onExchangeRatesUpdated().catch((err) => {
      logger.error({ err }, "Failed to trigger recalculation after exchange rate update");
    });
  });
}

export async function onExchangeRatesUpdated(): Promise<void> {
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
    logger.error({ err }, "Failed to trigger recalculation after exchange rate update");
  }
}

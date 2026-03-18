import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { recalculateEntriesConvertedAmount } from "@/features/ledger/server";
import { logger } from "@/lib/logger";
import { isNull } from "drizzle-orm";

export async function onExchangeRatesUpdated(): Promise<void> {
  try {
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

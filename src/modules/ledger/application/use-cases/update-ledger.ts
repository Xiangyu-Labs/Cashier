import { and, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { omitUndefinedProperties } from "@/lib/validation";
import { mapLedgerDto } from "@/modules/ledger/application/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";
import type { UpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import { recalculateEntriesConvertedAmount } from "@/modules/ledger/application/services/recalculate-entries-converted-amount";
import { ledgers } from "@/persistence";

export async function updateLedger(
  userId: string,
  ledgerId: string,
  data: UpdateLedgerInput
): Promise<LedgerDto> {
  const existing = await db.query.ledgers.findFirst({
    where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
  });

  if (existing == null) {
    throw new NotFoundError("Ledger");
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError("Access denied to this ledger");
  }

  const currentMetadata = existing.metadata ?? {};
  const currentSettings = currentMetadata.settings ?? {};
  const oldMainCurrency = currentSettings.mainCurrency ?? "CNY";
  const newMainCurrency = data.settings?.mainCurrency;

  const newSettings = omitUndefinedProperties({
    ...currentSettings,
    ...(data.settings ?? {}),
  });

  const [updatedLedger] = await db
    .update(ledgers)
    .set({
      metadata: {
        ...currentMetadata,
        settings: newSettings,
      },
    })
    .where(eq(ledgers.id, ledgerId))
    .returning();

  if (updatedLedger == null) {
    throw new NotFoundError("Ledger");
  }

  updateTag("ledger");

  if (newMainCurrency != null && newMainCurrency !== oldMainCurrency) {
    logger.info(
      { ledgerId, oldMainCurrency, newMainCurrency },
      "Main currency changed, recalculating entries"
    );

    recalculateEntriesConvertedAmount(ledgerId, newMainCurrency).catch((err: unknown) => {
      logger.error({ err, ledgerId }, "Failed to recalculate entries after currency change");
    });
  }

  return mapLedgerDto(updatedLedger);
}

"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/persistence";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { recalculateEntriesConvertedAmount } from "./helpers";
import { updateTag } from "next/cache";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import { mapLedgerDto } from "@/modules/ledger/mappers";
import type { LedgerDto } from "@/modules/ledger/contracts";
import { updateLedgerInputSchema, type UpdateLedgerInput } from "@/modules/ledger/contract-schemas";

export const updateLedgerAction = withAuth(
  async (userId: string, id: string, data: UpdateLedgerInput): Promise<LedgerDto> => {
    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing) {
      throw new NotFoundError("Ledger");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this ledger");
    }

    const validated = updateLedgerInputSchema.parse(data);

    const currentMetadata = existing.metadata || {};
    const currentSettings = currentMetadata.settings || {};
    const oldMainCurrency = currentSettings.mainCurrency ?? "CNY";
    const newMainCurrency = validated.settings?.mainCurrency;

    const newSettings = {
      ...currentSettings,
      ...(validated.settings || {}),
    };

    const [updatedLedger] = await db
      .update(ledgers)
      .set({
        metadata: {
          ...currentMetadata,
          settings: newSettings,
        },
      })
      .where(eq(ledgers.id, id))
      .returning();

    // Invalidate cache to ensure fresh data on next request
    updateTag("ledger");

    // If main currency changed, recalculate all entries' convertedAmount
    if (newMainCurrency != null && newMainCurrency !== oldMainCurrency) {
      logger.info(
        { ledgerId: id, oldMainCurrency, newMainCurrency },
        "Main currency changed, recalculating entries"
      );

      // Do this asynchronously to not block the response
      recalculateEntriesConvertedAmount(id, newMainCurrency).catch((err) => {
        logger.error({ err, ledgerId: id }, "Failed to recalculate entries after currency change");
      });
    }

    return mapLedgerDto(updatedLedger);
  }
);

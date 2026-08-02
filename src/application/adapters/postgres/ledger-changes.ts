import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerChangeBatches, ledgerChangeItems, ledgerSyncState } from "@/persistence";
import type { LedgerChangeReadPort } from "@/modules/source-document/application/ports";

export const postgresLedgerChangeReadAdapter: LedgerChangeReadPort = {
  async getVersion(ledgerId) {
    const state = await db.query.ledgerSyncState.findFirst({
      where: eq(ledgerSyncState.ledgerId, ledgerId),
      columns: { version: true },
    });
    return state?.version ?? BigInt(0);
  },

  async listBatches(input) {
    return db
      .select({
        version: ledgerChangeBatches.version,
        resetRequired: ledgerChangeBatches.resetRequired,
        countsChanged: ledgerChangeBatches.countsChanged,
        categoriesChanged: ledgerChangeBatches.categoriesChanged,
        settingsChanged: ledgerChangeBatches.settingsChanged,
        statsChanged: ledgerChangeBatches.statsChanged,
      })
      .from(ledgerChangeBatches)
      .where(
        and(
          eq(ledgerChangeBatches.ledgerId, input.ledgerId),
          gt(ledgerChangeBatches.version, input.afterVersion)
        )
      )
      .orderBy(asc(ledgerChangeBatches.version))
      .limit(input.limit);
  },

  async listChangedSourceDocumentIds(input) {
    if (input.versions.length === 0) return [];
    const rows = await db
      .selectDistinct({ id: ledgerChangeItems.sourceDocumentId })
      .from(ledgerChangeItems)
      .where(
        and(
          eq(ledgerChangeItems.ledgerId, input.ledgerId),
          inArray(ledgerChangeItems.version, input.versions)
        )
      )
      .limit(input.limit);
    return rows.map((row) => row.id);
  },
};

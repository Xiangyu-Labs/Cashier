import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerSyncState, sourceDocuments } from "@/persistence";
import type { LedgerStartupCacheMetadataPort } from "@/modules/workspace/application/ports";

export const postgresLedgerStartupCacheMetadataAdapter: LedgerStartupCacheMetadataPort = {
  async get(ledgerId) {
    const [documentState, syncState] = await Promise.all([
      db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(sourceDocuments)
        .where(and(eq(sourceDocuments.ledgerId, ledgerId), isNull(sourceDocuments.deletedAt)))
        .then((rows) => rows[0]),
      db.query.ledgerSyncState.findFirst({
        where: eq(ledgerSyncState.ledgerId, ledgerId),
        columns: { version: true },
      }),
    ]);
    return {
      version: syncState?.version ?? BigInt(0),
      recordCount: Number(documentState?.count ?? 0),
    };
  },
};

import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import type { BatchLedgerEntriesMutationResultDto } from "@/modules/ledger/contracts";
import { ledgerEntries } from "@/persistence";

export async function batchDeleteLedgerEntries(
  ledgerId: string,
  ledgerEntryIds: string[]
): Promise<BatchLedgerEntriesMutationResultDto> {
  const q = forLedger(ledgerEntries, ledgerId);
  const deletedEntries = await db
    .update(ledgerEntries)
    .set(q.softDelete)
    .where(and(q.whereActive, inArray(ledgerEntries.id, ledgerEntryIds)))
    .returning({ id: ledgerEntries.id });

  return {
    ledgerEntryIds,
    affectedCount: deletedEntries.length,
  };
}

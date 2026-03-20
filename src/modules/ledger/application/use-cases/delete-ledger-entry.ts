import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import { ledgerEntries } from "@/persistence";

export async function deleteLedgerEntry(
  ledgerId: string,
  ledgerEntryId: string
): Promise<DeleteLedgerEntryResultDto> {
  const q = forLedger(ledgerEntries, ledgerId);
  const deletedEntries = await db
    .update(ledgerEntries)
    .set(q.softDelete)
    .where(q.whereId(ledgerEntryId))
    .returning({ id: ledgerEntries.id });

  return {
    ledgerEntryId,
    deleted: deletedEntries.length > 0,
  };
}

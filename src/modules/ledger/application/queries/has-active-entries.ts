import type { LedgerReadPort } from "../ports";

/**
 * Returns true if the ledger has any non-deleted ledger entries that belong
 * to an active (non-deleted) source document revision.
 */
export async function hasActiveEntries(
  ledgerId: string,
  reads: Pick<LedgerReadPort, "hasActiveEntries">
): Promise<boolean> {
  return reads.hasActiveEntries(ledgerId);
}

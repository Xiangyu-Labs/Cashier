import type { BatchEntryDateImpact, LedgerReadPort } from "../ports";

/**
 * Computes the ledger-entry date change impact. Cross-module application
 * (updating the linked source documents) is orchestrated by the server
 * action so ledger application code never calls another domain's use case.
 */
export async function updateLedgerEntryDates(
  input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    entryDate: string;
  },
  dependencies: {
    reads: Pick<LedgerReadPort, "getBatchEntryDateImpact">;
  }
): Promise<BatchEntryDateImpact> {
  return dependencies.reads.getBatchEntryDateImpact({
    ledgerId: input.ledgerId,
    ledgerEntryIds: input.ledgerEntryIds,
  });
}

import type { BatchEntryDateImpact } from "../ports";

/**
 * Updates the linked source documents and returns the impact committed by the
 * same adapter transaction.
 */
export async function updateLedgerEntryDates(
  input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    entryDate: string;
  },
  dependencies: {
    updates: {
      updateDates(input: {
        ledgerId: string;
        ledgerEntryIds: string[];
        entryDate: string;
      }): Promise<BatchEntryDateImpact>;
    };
  }
): Promise<BatchEntryDateImpact> {
  return dependencies.updates.updateDates(input);
}

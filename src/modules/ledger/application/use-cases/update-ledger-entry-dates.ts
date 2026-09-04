import type { BatchEntryDateImpact } from "../ports";
import type {
  AtomicBatchCommandResult,
  VersionedTarget,
} from "@/modules/source-document/contracts";

/**
 * Updates the linked source documents and returns the impact committed by the
 * same adapter transaction.
 */
export async function updateLedgerEntryDates(
  input: {
    ledgerId: string;
    targets: VersionedTarget[];
    ledgerEntryIds: string[];
    entryDate: string;
  },
  dependencies: {
    updates: {
      updateDates(input: {
        ledgerId: string;
        targets: VersionedTarget[];
        ledgerEntryIds: string[];
        entryDate: string;
      }): Promise<AtomicBatchCommandResult<{ impact: BatchEntryDateImpact }>>;
    };
  }
): Promise<AtomicBatchCommandResult<{ impact: BatchEntryDateImpact }>> {
  return dependencies.updates.updateDates(input);
}

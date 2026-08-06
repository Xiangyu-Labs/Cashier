import type { BatchActionResult } from "@/lib/batch-ids";
import type { LedgerMutationPort } from "../ports";

export function batchDeleteLedgerEntries(
  input: { ledgerId: string; ledgerEntryIds: string[] },
  mutations: Pick<LedgerMutationPort, "batchDeleteEntries">
): Promise<BatchActionResult> {
  return mutations.batchDeleteEntries(input.ledgerId, input.ledgerEntryIds);
}

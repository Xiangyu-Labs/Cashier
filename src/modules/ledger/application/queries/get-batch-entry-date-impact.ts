import type { LedgerReadPort, BatchEntryDateImpact } from "../ports";

export function getBatchEntryDateImpact(
  input: { ledgerId: string; ledgerEntryIds: string[] },
  reads: Pick<LedgerReadPort, "getBatchEntryDateImpact">
): Promise<BatchEntryDateImpact> {
  return reads.getBatchEntryDateImpact(input);
}

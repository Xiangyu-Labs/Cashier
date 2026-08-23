import type { BatchEntryDateImpact, LedgerReadPort } from "@/modules/ledger/application/ports";

export async function previewSourceDocumentDateImpact(
  input: {
    ledgerId: string;
    sourceDocumentIds: readonly string[];
    ledgerEntryIds: readonly string[];
  },
  reads: Pick<LedgerReadPort, "getBatchEntryDateImpact">
): Promise<BatchEntryDateImpact> {
  const sourceDocumentIds = [...new Set(input.sourceDocumentIds)];
  if (input.ledgerEntryIds.length === 0) {
    return {
      selectedEntryCount: 0,
      sourceDocumentCount: sourceDocumentIds.length,
      affectedEntryCount: 0,
      sourceDocumentIds,
    };
  }

  const impact = await reads.getBatchEntryDateImpact({
    ledgerId: input.ledgerId,
    ledgerEntryIds: [...input.ledgerEntryIds],
  });
  return {
    ...impact,
    sourceDocumentCount: sourceDocumentIds.length,
    sourceDocumentIds,
  };
}

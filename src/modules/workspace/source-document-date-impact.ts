import type { BatchEntryDateImpact } from "@/modules/ledger/application/ports";
import { previewBatchLedgerEntryDateAction } from "@/modules/ledger/actions";

export async function previewSourceDocumentDateImpact(
  ledgerId: string,
  sourceDocumentIds: string[],
  ledgerEntryIds: string[]
): Promise<BatchEntryDateImpact> {
  const uniqueSourceDocumentIds = [...new Set(sourceDocumentIds)];
  if (ledgerEntryIds.length === 0) {
    return {
      selectedEntryCount: 0,
      sourceDocumentCount: uniqueSourceDocumentIds.length,
      affectedEntryCount: 0,
      sourceDocumentIds: uniqueSourceDocumentIds,
    };
  }

  const impact = await previewBatchLedgerEntryDateAction(ledgerId, ledgerEntryIds);
  return {
    ...impact,
    sourceDocumentCount: uniqueSourceDocumentIds.length,
    sourceDocumentIds: uniqueSourceDocumentIds,
  };
}

import type { SourceDocumentUpdatePort } from "@/modules/source-document/application/ports";
import type { BatchEntryDateImpact, LedgerReadPort } from "../ports";
import { batchUpdateSourceDocuments } from "@/modules/source-document/application/use-cases/update-source-document";

export async function updateLedgerEntryDates(
  input: {
    ledgerId: string;
    ledgerEntryIds: string[];
    entryDate: string;
  },
  dependencies: {
    reads: Pick<LedgerReadPort, "getBatchEntryDateImpact">;
    sourceDocuments: Pick<SourceDocumentUpdatePort, "batchUpdate">;
  }
): Promise<BatchEntryDateImpact> {
  const impact = await dependencies.reads.getBatchEntryDateImpact({
    ledgerId: input.ledgerId,
    ledgerEntryIds: input.ledgerEntryIds,
  });
  if (impact.sourceDocumentIds.length > 0) {
    await batchUpdateSourceDocuments(
      {
        ledgerId: input.ledgerId,
        sourceDocumentIds: impact.sourceDocumentIds,
        data: { entryDate: input.entryDate },
      },
      dependencies.sourceDocuments
    );
  }
  return impact;
}

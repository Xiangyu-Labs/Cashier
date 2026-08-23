import type { SourceDocumentCountsDto } from "../../contracts";
import type { SourceDocumentReadPort } from "../ports";

/**
 * Lightweight aggregation query that returns processing count and attention count
 * for a given ledger. Uses a single SQL pass for efficiency.
 */
export async function getSourceDocumentCountsQuery(
  ledgerId: string,
  documents: Pick<SourceDocumentReadPort, "counts">
): Promise<SourceDocumentCountsDto> {
  const result = await documents.counts(ledgerId);

  return {
    processingCount: result.processingCount,
    attentionCount: result.attentionCount,
  };
}

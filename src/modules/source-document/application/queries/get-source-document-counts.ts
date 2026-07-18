import { currentApplication } from "@/application/current";
import type { SourceDocumentCountsDto } from "../../contracts";

/**
 * Lightweight aggregation query that returns processing count and attention count
 * for a given ledger. Uses a single SQL pass for efficiency.
 */
export async function getSourceDocumentCountsQuery(
  ledgerId: string
): Promise<SourceDocumentCountsDto> {
  const result = await currentApplication.sourceDocumentReads.counts(ledgerId);

  return {
    processingCount: result.processingCount,
    attentionCount: result.attentionCount,
  };
}

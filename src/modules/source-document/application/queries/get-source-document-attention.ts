import type { SourceDocumentAttentionDto } from "../../contracts";
import type { SourceDocumentReadPort } from "../ports";

/**
 * Attention query that fetches documents with status:
 * processing, candidate_pending, duplicate_pending, anomaly, failed.
 *
 * This is independently bounded (hard limit of 50) and does NOT respect
 * date/amount filters — attention items must always be visible.
 */
const ATTENTION_HARD_LIMIT = 50;

export async function getSourceDocumentAttentionQuery(
  ledgerId: string,
  documents: Pick<SourceDocumentReadPort, "list" | "counts">
): Promise<SourceDocumentAttentionDto> {
  const [result, counts] = await Promise.all([
    documents.list({
      ledgerId,
      statuses: ["processing", "candidate_pending", "duplicate_pending", "anomaly", "failed"],
      limit: ATTENTION_HARD_LIMIT,
    }),
    documents.counts(ledgerId),
  ]);

  return {
    items: result.items,
    // The attention page lists processing documents alongside the attention
    // statuses, so the total must cover both.
    total: counts.attentionCount + counts.processingCount,
  };
}

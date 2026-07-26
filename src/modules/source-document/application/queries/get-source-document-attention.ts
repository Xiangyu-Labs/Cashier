import { currentApplication } from "@/application/current";
import type { SourceDocumentAttentionDto } from "../../contracts";

/**
 * Attention query that fetches documents with status:
 * processing, candidate_pending, anomaly, failed.
 *
 * This is independently bounded (hard limit of 50) and does NOT respect
 * date/amount filters — attention items must always be visible.
 */
const ATTENTION_HARD_LIMIT = 50;

export async function getSourceDocumentAttentionQuery(
  ledgerId: string
): Promise<SourceDocumentAttentionDto> {
  const result = await currentApplication.sourceDocumentReads.list({
    ledgerId,
    statuses: ["processing", "candidate_pending", "anomaly", "failed"],
    limit: ATTENTION_HARD_LIMIT,
  });

  return {
    items: result.items,
    total: result.items.length,
  };
}

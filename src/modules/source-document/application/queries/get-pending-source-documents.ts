import { groupPendingSourceDocuments } from "@/modules/source-document/grouping";
import type { PendingSourceDocumentsResponseDto } from "../../contracts";
import { querySourceDocumentPage } from "./list-source-document-page";
import type { SourceDocumentQueryPorts } from "../ports";

export async function getPendingSourceDocumentsQuery(
  ledgerId: string,
  ports: SourceDocumentQueryPorts,
  input: { limit: number; cursor?: string }
): Promise<PendingSourceDocumentsResponseDto> {
  const [result, stats] = await Promise.all([
    querySourceDocumentPage(
      ledgerId,
      {
        status: "processing,candidate_pending,duplicate_pending,anomaly,failed,cancelled",
        includeLedgerEntries: true,
        limit: input.limit,
        ...(input.cursor != null ? { cursor: input.cursor } : {}),
      },
      ports
    ),
    ports.documents.pendingSummary(ledgerId),
  ]);

  const typedItems = result.items.map((document) => ({
    ...document,
    ledgerEntries: document.ledgerEntries ?? [],
  }));
  const groups = groupPendingSourceDocuments(typedItems);
  return {
    groups,
    stats,
    nextCursor: result.nextCursor,
    hasMore: result.nextCursor != null,
  };
}

export async function getPendingSourceDocuments(
  ledgerId: string,
  ports: SourceDocumentQueryPorts,
  input: { limit: number; cursor?: string } = { limit: 20 }
): Promise<PendingSourceDocumentsResponseDto> {
  return getPendingSourceDocumentsQuery(ledgerId, ports, input);
}

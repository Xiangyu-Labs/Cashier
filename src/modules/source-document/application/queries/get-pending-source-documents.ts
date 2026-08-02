import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
} from "@/modules/source-document/grouping";
import type { PendingSourceDocumentsResponseDto } from "../../contracts";
import { querySourceDocumentPage } from "./list-source-document-page";
import type { SourceDocumentQueryPorts } from "../ports";

export async function getPendingSourceDocumentsQuery(
  ledgerId: string,
  ports: SourceDocumentQueryPorts
): Promise<PendingSourceDocumentsResponseDto> {
  const result = await querySourceDocumentPage(
    ledgerId,
    {
      status: "processing,anomaly,failed,cancelled",
      includeLedgerEntries: true,
    },
    ports
  );

  const typedItems = result.items.map((document) => ({
    ...document,
    ledgerEntries: document.ledgerEntries ?? [],
  }));
  const groups = groupPendingSourceDocuments(typedItems);
  const stats = calculateSourceDocumentStats(groups);

  return {
    groups,
    stats: {
      ...stats,
      total: calculatePendingTotal(groups),
    },
  };
}

export async function getPendingSourceDocuments(
  ledgerId: string,
  ports: SourceDocumentQueryPorts
): Promise<PendingSourceDocumentsResponseDto> {
  return getPendingSourceDocumentsQuery(ledgerId, ports);
}

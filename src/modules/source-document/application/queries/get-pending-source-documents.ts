import {
  calculatePendingTotal,
  calculateSourceDocumentStats,
  groupPendingSourceDocuments,
} from "@/modules/source-document/grouping";
import type { PendingSourceDocumentsResponseDto } from "../../contracts";
import { querySourceDocumentPage } from "./list-source-document-page";

export async function getPendingSourceDocumentsQuery(
  ledgerId: string
): Promise<PendingSourceDocumentsResponseDto> {
  const result = await querySourceDocumentPage(ledgerId, {
    status: "queued,processing,anomaly,failed",
    includeLedgerEntries: true,
  });

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
  ledgerId: string
): Promise<PendingSourceDocumentsResponseDto> {
  return getPendingSourceDocumentsQuery(ledgerId);
}

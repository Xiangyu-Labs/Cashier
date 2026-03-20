import {
  getPendingSourceDocumentsQuery,
  getSourceDocumentFullQuery,
  listAllSourceDocumentsQuery,
  listSourceDocumentsQuery,
} from "@/modules/source-document/application/queries/source-document-queries";
import {
  listSourceDocumentsInputSchema,
  type ListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";
import type {
  PendingSourceDocumentsResponseDto,
  SourceDocumentCollectionDto,
  SourceDocumentFullDto,
  SourceDocumentPageDto,
} from "@/modules/source-document/contracts";

export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  const validated = listSourceDocumentsInputSchema.parse(params);
  return listSourceDocumentsQuery(ledgerId, {
    status: validated.status ?? null,
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    cursor: validated.cursor ?? null,
    limit: validated.limit,
    includeLedgerEntries: validated.includeEntries,
  });
}

export async function getAllSourceDocuments(
  ledgerId: string,
  params: {
    startDate?: string | null;
    endDate?: string | null;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<SourceDocumentCollectionDto> {
  return listAllSourceDocumentsQuery(ledgerId, params);
}

export async function getPendingSourceDocuments(
  ledgerId: string
): Promise<PendingSourceDocumentsResponseDto> {
  return getPendingSourceDocumentsQuery(ledgerId);
}

export async function getSourceDocumentFull(
  ledgerId: string,
  sourceDocumentId: string
): Promise<SourceDocumentFullDto | null> {
  return getSourceDocumentFullQuery(ledgerId, sourceDocumentId);
}

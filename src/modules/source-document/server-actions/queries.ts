"use server";
import { ValidationError } from "@/lib/errors";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getPendingSourceDocuments } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { getSourceDocumentCollection } from "@/modules/source-document/application/queries/list-source-document-collection";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";
import { listSourceDocuments as listSourceDocumentsPage } from "@/modules/source-document/application/queries/list-source-document-page";
import {
  PendingSourceDocumentsResponseDto,
  SourceDocumentCollectionDto,
  SourceDocumentFullDto,
  SourceDocumentPageDto,
} from "@/modules/source-document/contracts";
import {
  sourceDocumentIdSchema,
  type ListSourceDocumentCollectionInput,
  type ListSourceDocumentsInput,
} from "@/modules/source-document/contract-schemas";

/**
 * Get paginated source documents with cursor-based pagination
 */
export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  return listSourceDocumentsPage(ledgerId, params);
}

export const getSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string, params: ListSourceDocumentsInput): Promise<SourceDocumentPageDto> =>
    listSourceDocuments(ledgerId, params)
);

/**
 * Get the bounded source document collection used by the workspace stream.
 */
export const getSourceDocumentCollectionAction = withLedgerAccess(
  async (
    ledgerId: string,
    params: ListSourceDocumentCollectionInput
  ): Promise<SourceDocumentCollectionDto> => {
    return getSourceDocumentCollection(ledgerId, params);
  }
);

/**
 * Get all pending source documents (processing + anomaly + failed + queued)
 * Used for the pending source documents modal that should always show ALL pending items.
 */
export const getPendingSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string): Promise<PendingSourceDocumentsResponseDto> =>
    getPendingSourceDocuments(ledgerId)
);

/**
 * Get a single source document with full data (including imageUrls).
 * Used for edit-retry when the list view has stripped imageUrls.
 */
export const getSourceDocumentFullAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentId: string): Promise<SourceDocumentFullDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }

    return getSourceDocumentFullQuery(ledgerId, parsed.data);
  }
);
